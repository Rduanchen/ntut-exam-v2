import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JudgeQueueService } from "../../../src/services/judge-queue.service";

/* Wait for real quiescence rather than guessing a number of ticks. Counting
 * ticks is how background work escapes its test and starts corrupting the
 * next one — observed here, as intermittent failures in unrelated files. */
const settle = () => JudgeQueueService.settle();

beforeEach(() => JudgeQueueService.reset());
afterEach(() => JudgeQueueService.settle());

describe("US3 - judging runs in the background behind a handle", () => {
  it("returns a handle before the run finishes", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));

    const { job } = JudgeQueueService.start("s1", async () => {
      await gate;
      return { graded: 3, systemFailures: 0 };
    });

    // The handle exists while the work is still blocked.
    expect(job.id).toBeTruthy();
    expect(job.outcome).toBeUndefined();
    expect(["waiting", "running"]).toContain(job.state);

    release();
    await settle();
    expect(JudgeQueueService.get(job.id)!.state).toBe("finished");
  });

  it("moves through running to finished and records the outcome", async () => {
    const { job } = JudgeQueueService.start("s2", async () => ({
      graded: 4,
      systemFailures: 2,
    }));

    await settle();
    const done = JudgeQueueService.get(job.id)!;
    expect(done.state).toBe("finished");
    expect(done.outcome).toEqual({ graded: 4, systemFailures: 2 });
    expect(done.finishedAt).toBeGreaterThanOrEqual(done.startedAt);
  });

  it("reports a broken run as failed rather than letting it appear to run forever", async () => {
    const { job } = JudgeQueueService.start("s3", async () => {
      throw new Error("database gone");
    });

    await settle();
    const done = JudgeQueueService.get(job.id)!;
    expect(done.state).toBe("failed");
    expect(done.error).toContain("database gone");
    expect(done.finishedAt).toBeDefined();
  });

  it("hands back the existing handle instead of starting a second run", async () => {
    // What a TA double-clicking actually wants. Two concurrent runs would
    // interleave writes to the same submissions and the same scoreboard row.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const run = vi.fn(async () => {
      await gate;
      return { graded: 1, systemFailures: 0 };
    });

    const first = JudgeQueueService.start("s4", run);
    const second = JudgeQueueService.start("s4", run);

    expect(second.alreadyRunning).toBe(true);
    expect(second.job.id).toBe(first.job.id);
    expect(run).toHaveBeenCalledTimes(1);

    release();
    await settle();
  });

  it("allows a new run once the previous one has finished", async () => {
    const { job: first } = JudgeQueueService.start("s5", async () => ({
      graded: 1,
      systemFailures: 0,
    }));
    await settle();

    const { job: second, alreadyRunning } = JudgeQueueService.start("s5", async () => ({
      graded: 2,
      systemFailures: 0,
    }));

    expect(alreadyRunning).toBe(false);
    expect(second.id).not.toBe(first.id);
    await settle();
  });

  it("does not conflate different students", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const blocked = async () => {
      await gate;
      return { graded: 0, systemFailures: 0 };
    };

    const a = JudgeQueueService.start("alice", blocked);
    const b = JudgeQueueService.start("bob", blocked);

    expect(b.alreadyRunning).toBe(false);
    expect(b.job.id).not.toBe(a.job.id);

    release();
    await settle();
  });

  it("reports zero system failures as zero, not as an absent field", async () => {
    // An absent count is indistinguishable from an unreported one.
    const { job } = JudgeQueueService.start("s6", async () => ({
      graded: 5,
      systemFailures: 0,
    }));
    await settle();

    expect(JudgeQueueService.get(job.id)!.outcome).toHaveProperty("systemFailures", 0);
  });
});
