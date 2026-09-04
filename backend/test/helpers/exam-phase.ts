import { SystemSettings } from '../../src/models/system-settings.model';
import { User } from '../../src/models/user.model';
import { ExamState } from '../../src/services/exam-state.service';
import { SystemSettingsService } from '../../src/services/system-settings.service';
import { ExamConfigCryptoService } from '../../src/services/exam-config-crypto.service';

/**
 * Put the stored exam phase directly, without going through the transition
 * table.
 *
 * A test that needs the exam to be running should say so in one line rather
 * than walking UNINITIALIZED → INITIALIZED → SETUP_FINISHED → IN_PROGRESS,
 * which would make every student-endpoint test depend on the whole state
 * machine working. Tests of the transition table itself live in
 * `test/unit/services/exam-state.service.test.ts`.
 *
 * Also stamps the change time, so phases with a time-dependent meaning
 * (FINISHED and its submit grace window) behave as they would in a real run.
 */
export async function seedExamPhase(phase: ExamState): Promise<void> {
  await SystemSettings.destroy({ where: { name: 'exam_state' } });
  await SystemSettings.destroy({ where: { name: 'exam_state_changed_at' } });
  await SystemSettings.create({ name: 'exam_state', value: JSON.stringify(phase) });
  await SystemSettings.create({
    name: 'exam_state_changed_at',
    value: JSON.stringify(new Date().toISOString()),
  });
}

/**
 * Satisfy what UNINITIALIZED → INITIALIZED requires.
 *
 * The transition refuses until the paper is uploaded and the roster exists,
 * so that phase cannot be reached by skipping initialisation. The global test
 * setup already seeds the config; this adds the roster.
 */
export async function satisfyInitializePreconditions(): Promise<void> {
  if ((await User.count()) === 0) {
    await User.create({ testId: 'precondition-student', name: 'Precondition', ipAddress: null });
  }

  /* The split paper and its key. Without them a machine could be handed
   * something readable, which is what the phase exists to prevent — so the
   * transition refuses until they exist. */
  if (!(await SystemSettingsService.getSetting('exam_key'))) {
    const config = await SystemSettingsService.getExamConfig();
    if (config) {
      const prepared = ExamConfigCryptoService.prepare(config as any);
      await SystemSettingsService.upsertSetting('exam_key', prepared.examKey);
      await SystemSettingsService.upsertSetting('exam_config_meta', prepared.meta);
      await SystemSettingsService.upsertSetting('exam_config_cipher', prepared.cipher);
    }
  }
}
