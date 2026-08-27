import { describe, it, expect, beforeEach } from "vitest";
import { Submission } from "../../../src/models/submission.model";
import { JudgeStartupService } from "../../../src/services/judge-startup.service";
import { setupTestUser } from "../../fixtures/mockFactories";

const seeded = new Set<string>();
const seed = async (testId: string, questionId: string, status: string, autoScore: number | null = null) => {
  if (!seeded.has(testId)) {
    await setupTestUser(testId);
    seeded.add(testId);
  }
  return Submission.create({ testId, questionId, language: "c", codeContent: "int main(){}", status, autoScore } as never);
};

beforeEach(() => seeded.clear()); // tables are truncated between tests

describe("US3 - an interrupted run leaves nothing stuck", () => {
  it("returns submissions stranded mid-judge to a re-judgeable state", async () => {
    // Without this, a crash leaves them "being judged" by a process that no
    // longer exists, and nothing in the system ever revisits them.
    await seed("i1", "Q1", "Judging");
    await seed("i1", "Q2", "Judging");

    const recovered = await JudgeStartupService.recoverInterruptedJudging();

    expect(recovered).toBe(2);
    const rows = await Submission.findAll({ where: { testId: "i1" } });
    expect(rows.every((r) => r.status === "Pending")).toBe(true);
  });

  it("leaves terminal states alone", async () => {
    await seed("i2", "Q1", "Graded", 80);
    await seed("i2", "Q2", "SystemError");
    await seed("i2", "Q3", "Pending");

    await JudgeStartupService.recoverInterruptedJudging();

    const rows = await Submission.findAll({ where: { testId: "i2" }, order: [["questionId", "ASC"]] });
    expect(rows.map((r) => r.status)).toEqual(["Graded", "SystemError", "Pending"]);
    expect(rows[0].autoScore).toBe(80);
  });

  it("migrates legacy Error rows to SystemError", async () => {
    // The old value already meant "the system could not judge this"; it was
    // merely named as though the student owned the failure.
    await seed("i3", "Q1", "Error");

    const migrated = await JudgeStartupService.normaliseLegacyStatuses();

    expect(migrated).toBe(1);
    const row = await Submission.findOne({ where: { testId: "i3", questionId: "Q1" } });
    expect(row!.status).toBe("SystemError");
  });

  it("is idempotent, so every boot can run it", async () => {
    await seed("i4", "Q1", "Judging");

    await JudgeStartupService.run();
    const second = await JudgeStartupService.run();

    expect(second).toEqual({ recovered: 0, migrated: 0 });
  });
});
