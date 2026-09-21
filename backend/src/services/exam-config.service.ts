import { SystemSettingsService } from "./system-settings.service";
import { ExamConfigParserService } from "./exam-config-parser.service";
import { verifyExamConfig, ExamConfig } from "../schemas/config.schema";
import { HttpError } from "../utils/http-error";
import { ExamConfigCryptoService } from "./exam-config-crypto.service";


/**
 * Re-encrypt an amended paper without changing the key.
 *
 * The key stays as it is. Machines are already holding it, and the password
 * that unwraps it has already been read out in the room — issuing a new one
 * mid-exam would strand every seat. Nothing happens before initialisation,
 * when there is no key to reissue under.
 */
async function reissuePreparedPaper(config: ExamConfig): Promise<void> {
  const examKey = await SystemSettingsService.getSetting<string>("exam_key");
  const meta = await SystemSettingsService.getSetting<any>("exam_config_meta");
  if (!examKey || !meta?.wrappedExamKey) return;

  const reissued = ExamConfigCryptoService.reissue(config, examKey, meta.wrappedExamKey);
  await SystemSettingsService.upsertSetting("exam_config_meta", reissued.meta);
  await SystemSettingsService.upsertSetting("exam_config_cipher", reissued.cipher);
}

export class ExamConfigService {
  /**
   * Validate and save the global exam config.
   * If validation fails, throws a 400 Bad Request error with Zod issues.
   */
  static async validateAndSave(payload: any): Promise<ExamConfig> {
    const { examConfig, isCorrect, errors } = verifyExamConfig(payload);
    if (!isCorrect || !examConfig) {
      throw new HttpError(400, `Bad Request: ${JSON.stringify(errors)}`);
    }

    await SystemSettingsService.saveExamConfig(examConfig);
    await reissuePreparedPaper(examConfig);
    return examConfig;
  }

  /**
   * Performs a restricted update of the configuration.
   * Only allows merging specific fields if the system has already been initialized.
   */
  static async restrictedUpdate(newPayload: any): Promise<ExamConfig> {
    const oldConfig = await SystemSettingsService.getExamConfig();
    if (!oldConfig) {
      throw new HttpError(404, "Not Found: No existing exam configuration found to update");
    }

    const { examConfig: verifiedNewConfig, isCorrect, errors } = verifyExamConfig(newPayload);
    if (!isCorrect || !verifiedNewConfig) {
      throw new HttpError(400, `Bad Request: ${JSON.stringify(errors)}`);
    }

    // Clone the new config to act as the baseline
    const mergedConfig: ExamConfig = JSON.parse(JSON.stringify(verifiedNewConfig));

    mergedConfig.accessibleUsers = oldConfig.accessibleUsers;
    mergedConfig.environmentVariables = oldConfig.environmentVariables;
    /* judgerSettings is deliberately NOT preserved here.
     *
     * Adding it to this list would quietly defeat the deployment model: an
     * uploaded configuration is meant to replace judging settings wholesale,
     * so that one file fully defines one machine. Preserving them would make
     * an omitted field keep its previous value, which is the merge behaviour
     * that was explicitly rejected. */

    if (mergedConfig.sections.length !== oldConfig.sections.length) {
      throw new HttpError(400, "Bad Request: Cannot change the number of sections after initialization");
    }

    for (let i = 0; i < mergedConfig.sections.length; i++) {
      const newSection = mergedConfig.sections[i];
      const oldSection = oldConfig.sections[i];

      if (newSection.id !== oldSection.id) {
        throw new HttpError(400, `Bad Request: Cannot change section ID from ${oldSection.id} to ${newSection.id}`);
      }

      if (newSection.puzzles.length !== oldSection.puzzles.length) {
        throw new HttpError(400, `Bad Request: Cannot change the number of puzzles in section ${oldSection.id}`);
      }

      for (let j = 0; j < newSection.puzzles.length; j++) {
        const newPuzzle = newSection.puzzles[j];
        const oldPuzzle = oldSection.puzzles[j];

        if (newPuzzle.id !== oldPuzzle.id) {
          throw new HttpError(400, `Bad Request: Cannot change puzzle ID from ${oldPuzzle.id} to ${newPuzzle.id}`);
        }

        if (newPuzzle.language !== oldPuzzle.language) {
          throw new HttpError(400, `Bad Request: Cannot change language of puzzle ${oldPuzzle.id}`);
        }

        if (newPuzzle.subtasks.length !== oldPuzzle.subtasks.length) {
          throw new HttpError(400, `Bad Request: Cannot change the number of subtasks in puzzle ${oldPuzzle.id}`);
        }

        for (let k = 0; k < newPuzzle.subtasks.length; k++) {
          const newSubtask = newPuzzle.subtasks[k];
          const oldSubtask = oldPuzzle.subtasks[k];

          if (newSubtask.visible.length !== oldSubtask.visible.length) {
            throw new HttpError(400, `Bad Request: Cannot change the number of visible test cases in puzzle ${oldPuzzle.id}`);
          }
          if (newSubtask.hidden.length !== oldSubtask.hidden.length) {
            throw new HttpError(400, `Bad Request: Cannot change the number of hidden test cases in puzzle ${oldPuzzle.id}`);
          }
        }
      }
    }

    await SystemSettingsService.saveExamConfig(mergedConfig);
    await reissuePreparedPaper(mergedConfig);
    return mergedConfig;
  }
}
