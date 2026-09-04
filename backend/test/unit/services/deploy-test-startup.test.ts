import { describe, expect, it } from 'vitest';
import { DeployTestRepository } from '../../../src/services/deploy-test-repository';
import { DeployTestStartupService } from '../../../src/services/deploy-test-startup.service';
import { deployRun } from '../../fixtures/deploy-test.fixture';

describe('deployment test restart recovery', () => {
  it('interrupts active work while preserving partial evidence', async () => {
    await DeployTestRepository.replace(deployRun({ state: 'running', overallOutcome: undefined, finishedAt: undefined, errors: ['partial'] }));
    await DeployTestStartupService.run(99);
    expect(await DeployTestRepository.read()).toMatchObject({ state: 'interrupted', overallOutcome: 'interrupted', interruptionReason: 'process_restart', finishedAt: 99, errors: ['partial', expect.any(String)] });
  });
  it('leaves terminal evidence immutable', async () => {
    const terminal = deployRun(); await DeployTestRepository.replace(terminal); await DeployTestStartupService.run(99);
    expect(await DeployTestRepository.read()).toEqual(terminal);
  });
});
