import { describe, expect, it } from 'vitest';
import { SystemSettings } from '../../../src/models/system-settings.model';
import { RehearsalRepository, REHEARSAL_SETTING_KEY } from '../../../src/services/rehearsal-repository';
import { rehearsalRun } from '../../fixtures/rehearsal.fixture';

describe('latest rehearsal persistence', () => {
  it('creates, reads, and replaces the singleton', async () => {
    await RehearsalRepository.replace(rehearsalRun());
    expect((await RehearsalRepository.read())?.overallOutcome).toBe('passed');

    await RehearsalRepository.replace(rehearsalRun({ overallOutcome: 'failed' }));
    expect((await RehearsalRepository.read())?.overallOutcome).toBe('failed');
    expect(await SystemSettings.count({ where: { name: REHEARSAL_SETTING_KEY } })).toBe(1);
  });

  it('returns null when no rehearsal has ever run', async () => {
    expect(await RehearsalRepository.read()).toBeNull();
  });

  it('refuses corrupt or invalid persisted content rather than returning it', async () => {
    await SystemSettings.create({ name: REHEARSAL_SETTING_KEY, value: '{' });
    await expect(RehearsalRepository.read()).rejects.toThrow();

    await SystemSettings.upsert({ name: REHEARSAL_SETTING_KEY, value: JSON.stringify({ id: 'not-a-uuid' }) });
    await expect(RehearsalRepository.read()).rejects.toThrow();
  });

  it('refuses to write a run the schema rejects', async () => {
    const broken = { ...rehearsalRun(), stages: [] } as never;
    await expect(RehearsalRepository.replace(broken)).rejects.toThrow();
  });
});
