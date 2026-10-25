import { createApp } from '../../src/app';
import { initDatabase, sequelize } from '../../src/config/database.config';
import { DeviceKeyMap } from '../../src/models/device-key-map.model';
import { SystemSettingsService } from '../../src/services/system-settings.service';
import { ExamConfigCryptoService } from '../../src/services/exam-config-crypto.service';
import { buildExamConfig } from '../fixtures/exam-config.fixture';
import { buildDeviceKey } from '../fixtures/identity.fixture';

async function main(): Promise<void> {
  if (process.env.DB_STORAGE !== ':memory:' || process.env.LOAD_TEST_MODE) throw new Error('Only isolated, authenticated tests are allowed');
  await initDatabase();
  const paper = ExamConfigCryptoService.prepare(buildExamConfig());
  await SystemSettingsService.savePreparedPaper(paper);
  await SystemSettingsService.upsertSetting('exam_state', 'SETUP_FINISHED');
  await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid: 'paired-device', clientAesKey: 'ab'.repeat(32) }) });
  const server = createApp().listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (address && typeof address !== 'string') process.send?.({ port: address.port });
  });
  process.on('message', message => {
    if (message === 'stop') server.close(() => { void sequelize.close().then(() => process.exit(0)); });
  });
}
void main().catch(() => process.exit(1));
