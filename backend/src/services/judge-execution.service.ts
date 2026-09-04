import {
  FaultAttribution,
  type ExecuteOptions,
  type JudgeOptions,
  type JudgeResult,
  type PistonJudger,
} from "piston-judger";
import type { DeployTestAttempt, DeployTestAttribution, DeployTestVerdict } from "../types/deploy-test.type";
import { truncateJudgerOutput } from "../utils/judger-output.util";
import { withExecutionSlot } from "./judge-limiter";

export interface ExecuteJudgeRequest {
  language: string;
  code: string;
  execute: ExecuteOptions;
  judge: JudgeOptions;
  maxSystemRetries: number;
  interrupted?: () => boolean;
}

export interface ExecuteJudgeResult {
  verdict: JudgeResult;
  attempts: DeployTestAttempt[];
}

const verdictName = (value: string): DeployTestVerdict => {
  const allowed: DeployTestVerdict[] = ["AC", "WA", "CE", "RE", "TLE", "MLE", "OLE", "CTLE", "SE"];
  return allowed.includes(value as DeployTestVerdict) ? value as DeployTestVerdict : "UNKNOWN";
};

const attributionName = (value: string): DeployTestAttribution =>
  value === "submission" || value === "system" ? value : "unknown";

export class JudgeExecutionService {
  constructor(
    private readonly client: PistonJudger,
    private readonly now: () => number = Date.now,
  ) {}

  async executeAndJudge(request: ExecuteJudgeRequest): Promise<ExecuteJudgeResult> {
    const attempts: DeployTestAttempt[] = [];
    let attempt = 0;
    for (;;) {
      if (request.interrupted?.()) throw new Error("Execution interrupted before admission");
      const enqueuedAt = this.now();
      let slotAcquiredAt = enqueuedAt;
      const outcome = await withExecutionSlot(async () => {
        slotAcquiredAt = this.now();
        if (request.interrupted?.()) throw new Error("Execution interrupted before sandbox call");
        return this.client.execute(request.language, request.code, request.execute);
      });
      const verdict = this.client.judge(outcome, request.judge);
      const finishedAt = this.now();
      attempts.push({
        attempt: attempt + 1,
        status: verdictName(verdict.status),
        attribution: attributionName(verdict.attribution),
        stage: verdict.details.stage,
        enqueuedAt,
        slotAcquiredAt,
        finishedAt,
        queueMs: Math.max(0, slotAcquiredAt - enqueuedAt),
        executionMs: Math.max(0, finishedAt - slotAcquiredAt),
        totalMs: Math.max(0, finishedAt - enqueuedAt),
        diagnostic: truncateJudgerOutput(verdict.message || verdict.actualOutput),
      });
      if (verdict.attribution !== FaultAttribution.SYSTEM || attempt >= request.maxSystemRetries) {
        return { verdict, attempts };
      }
      attempt += 1;
    }
  }
}
