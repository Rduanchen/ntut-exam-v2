import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type JudgeResult, type PistonJudger } from 'piston-judger';
import { JudgeExecutionService } from '../../../src/services/judge-execution.service';
import { accepted, compileTimedOut, executionOk } from '../../fixtures/judge-verdicts.fixture';
import { setExecutionCeiling, withExecutionSlot } from '../../../src/services/judge-limiter';

const clientWith = (verdicts: JudgeResult[]): PistonJudger => {
  let index = 0;
  return {
    runtimes: vi.fn(async () => []),
    execute: vi.fn(async () => executionOk()),
    judge: vi.fn(() => verdicts[Math.min(index++, verdicts.length - 1)]),
  };
};

beforeEach(() => setExecutionCeiling(1));
describe('shared judge execution primitive', () => {
  it('passes explicit limits and records queue/execution timings', async () => {
    let now = 0;
    const client = clientWith([accepted()]);
    const service = new JudgeExecutionService(client, () => ++now);
    const result = await service.executeAndJudge({ language: 'c', code: 'x', execute: { compile_timeout: 123, run_timeout: 456 }, judge: { expectedOutput: '42\n' }, maxSystemRetries: 0 });
    expect(client.execute).toHaveBeenCalledWith('c', 'x', expect.objectContaining({ compile_timeout: 123, run_timeout: 456 }));
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].queueMs).toBeGreaterThanOrEqual(0);
  });
  it('retries only system-attributed verdicts and exposes every attempt', async () => {
    const client = clientWith([compileTimedOut(), accepted()]);
    const result = await new JudgeExecutionService(client).executeAndJudge({ language: 'c', code: 'x', execute: {}, judge: {}, maxSystemRetries: 2 });
    expect(result.verdict.status).toBe('AC');
    expect(result.attempts.map((attempt) => attempt.attribution)).toEqual(['system', 'submission']);
  });
  it('checks interruption before consuming a global slot', async () => {
    const client = clientWith([accepted()]);
    await expect(new JudgeExecutionService(client).executeAndJudge({ language: 'c', code: 'x', execute: {}, judge: {}, maxSystemRetries: 0, interrupted: () => true })).rejects.toThrow('interrupted');
    expect(client.execute).not.toHaveBeenCalled();
  });
  it('rechecks interruption after a queued execution acquires its slot', async () => {
    let release!: () => void;
    const blocker = withExecutionSlot(() => new Promise<void>((resolve) => { release = resolve; }));
    await new Promise((resolve) => setImmediate(resolve));
    let interrupted = false;
    const client = clientWith([accepted()]);
    const pending = new JudgeExecutionService(client).executeAndJudge({ language: 'c', code: 'x', execute: {}, judge: {}, maxSystemRetries: 0, interrupted: () => interrupted });
    interrupted = true; release(); await blocker;
    await expect(pending).rejects.toThrow('sandbox call');
    expect(client.execute).not.toHaveBeenCalled();
  });
});
