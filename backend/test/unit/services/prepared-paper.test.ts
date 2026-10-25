import { describe, expect, it, vi } from 'vitest';
import { SystemSettingsService } from '../../../src/services/system-settings.service';
import { SystemSettings } from '../../../src/models/system-settings.model';
import { ExamConfigCryptoService } from '../../../src/services/exam-config-crypto.service';
import { buildExamConfig } from '../../fixtures/exam-config.fixture';

describe('prepared paper snapshot', () => {
  it('reads and replaces the two halves as one database statement', async () => {
    const first = ExamConfigCryptoService.prepare(buildExamConfig({ testTitle: 'first' }));
    const second = ExamConfigCryptoService.prepare(buildExamConfig({ testTitle: 'second' }));
    await SystemSettingsService.savePreparedPaper(first);
    const read = vi.spyOn(SystemSettings, 'findAll');
    const write = vi.spyOn(SystemSettings, 'bulkCreate');
    const snapshots = await Promise.all([
      SystemSettingsService.getPreparedPaper(),
      SystemSettingsService.savePreparedPaper(second).then(() => SystemSettingsService.getPreparedPaper()),
    ]);
    expect(write).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(2);
    for (const snapshot of snapshots) {
      const expected = snapshot?.meta.testTitle === 'first' ? first : second;
      expect(snapshot?.meta).toEqual(expected.meta);
      expect(snapshot?.cipher).toEqual(expected.cipher);
    }
    read.mockRestore(); write.mockRestore();
  });
  it('does not replace a valid paper with invalid data', async () => {
    const valid = ExamConfigCryptoService.prepare(buildExamConfig());
    await SystemSettingsService.savePreparedPaper(valid);
    await expect(SystemSettingsService.savePreparedPaper({ meta: {}, cipher: {} })).rejects.toThrow();
    expect(await SystemSettingsService.getPreparedPaper()).toEqual({ meta: valid.meta, cipher: valid.cipher });
  });
});
