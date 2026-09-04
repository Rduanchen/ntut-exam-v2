import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FaultAttribution, StatusCode, type JudgeResult, type PistonJudger } from 'piston-judger';
import { DeployTestService } from '../../../src/services/deploy-test.service';
import { DeployTestRepository } from '../../../src/services/deploy-test-repository';
import { ExamState } from '../../../src/services/exam-state.service';
import { accepted, executionOk } from '../../fixtures/judge-verdicts.fixture';

let code = '';
const verdict = (status: StatusCode): JudgeResult => ({ ...accepted(), status, attribution: FaultAttribution.SUBMISSION, message: status, actualOutput: status === StatusCode.OLE ? 'x'.repeat(10_000) : '' });
const client: PistonJudger = {
  runtimes: vi.fn(async () => []),
  execute: vi.fn(async (_language, source = '') => { code = source; return executionOk(); }),
  judge: vi.fn(() => {
    if (code.includes('main( {')) return verdict(StatusCode.CE);
    if (code.includes('*p=1')) return verdict(StatusCode.RE);
    if (code.includes('for(;;){}')) return verdict(StatusCode.TLE);
    if (code.includes('256*1024')) return verdict(StatusCode.MLE);
    if (code.includes('puts(')) return verdict(StatusCode.OLE);
    return accepted();
  }),
};

beforeEach(() => DeployTestService.configureForTests({ examState: async () => ExamState.NOT_STARTED, health: async () => ({ reachable: true, url: 'piston', runtimes: [{ language: 'c', version: '10', aliases: ['gcc'] }] }), client: () => client }));
describe('controlled verdict suite', () => {
  it('matches CE/RE/TLE/MLE/OLE attribution, bounds evidence, and performs a health probe', async () => {
    await DeployTestService.start({ phases: ['verdict'], languages: ['c'], concurrencyLevels: [1], jobCount: 1, deadlineMs: 60_000 });
    await DeployTestService.settle();
    const run = await DeployTestRepository.read();
    expect(run?.probes.map((probe) => probe.observedStatus)).toEqual(['CE', 'RE', 'TLE', 'MLE', 'OLE', 'AC']);
    expect(run?.probes.every((probe) => probe.status === 'passed')).toBe(true);
    expect(run?.probes.every((probe) => probe.diagnostic.length <= 5_000)).toBe(true);
    expect(run?.overallOutcome).toBe('passed');
    const mleCall = vi.mocked(client.judge).mock.calls[3];
    expect(mleCall[1]?.memoryLimit).toBeLessThan(32 * 1024 * 1024);
  });
});
