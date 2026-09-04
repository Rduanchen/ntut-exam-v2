import { describe, expect, it } from 'vitest';
import { SystemSettings } from '../../../src/models/system-settings.model';
import { DeployTestRepository, DEPLOY_TEST_SETTING_KEY } from '../../../src/services/deploy-test-repository';
import { deployRun } from '../../fixtures/deploy-test.fixture';

describe('latest deployment test persistence', () => {
  it('creates, reads, and replaces the singleton', async () => {
    await DeployTestRepository.replace(deployRun());
    expect((await DeployTestRepository.read())?.overallOutcome).toBe('passed');
    await DeployTestRepository.replace(deployRun({ overallOutcome: 'warning' }));
    expect((await DeployTestRepository.read())?.overallOutcome).toBe('warning');
    expect(await SystemSettings.count({ where: { name: DEPLOY_TEST_SETTING_KEY } })).toBe(1);
  });
  it('rejects corrupt persisted JSON and invalid shapes', async () => {
    await SystemSettings.create({ name: DEPLOY_TEST_SETTING_KEY, value: '{' });
    await expect(DeployTestRepository.read()).rejects.toThrow();
  });
});
