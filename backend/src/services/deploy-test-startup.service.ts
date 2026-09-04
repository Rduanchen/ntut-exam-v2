import { truncateJudgerOutput } from "../utils/judger-output.util";
import { isTerminalDeployTestState } from "../types/deploy-test.type";
import { DeployTestRepository } from "./deploy-test-repository";

export class DeployTestStartupService {
  static async run(now = Date.now()): Promise<void> {
    const latest = await DeployTestRepository.read();
    if (!latest || isTerminalDeployTestState(latest.state)) return;
    await DeployTestRepository.replace({
      ...latest,
      state: "interrupted",
      overallOutcome: "interrupted",
      interruptionReason: "process_restart",
      finishedAt: now,
      errors: [...latest.errors, truncateJudgerOutput("Deployment test interrupted by process restart")],
    });
  }
}
