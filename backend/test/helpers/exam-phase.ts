import { SystemSettings } from '../../src/models/system-settings.model';
import { ExamState } from '../../src/services/exam-state.service';

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
