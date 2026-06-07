import { SystemSettingsService } from "./system-settings.service";
import { ExamConfigParserService } from "./exam-config-parser.service";
import { verifyExamConfig, ExamConfig } from "../schemas/config.schema";
import { HttpError } from "../utils/http-error";

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

    // Clone the old config to act as the baseline
    const mergedConfig: ExamConfig = JSON.parse(JSON.stringify(oldConfig));

    // Iterate through sections and puzzles of the verified new payload
    for (const newSection of verifiedNewConfig.sections) {
      for (const newPuzzle of newSection.puzzles) {
        // Search for the matching puzzle ID in the old configuration baseline
        const targetPuzzle = await ExamConfigParserService.getPuzzleById(newPuzzle.id, mergedConfig);

        if (targetPuzzle) {
          // 3. 找到後，只允許將 timeLimit、memoryLimit、score 的值從 newPayload 覆蓋過去。
          if (newPuzzle.timeLimit !== undefined) {
            targetPuzzle.timeLimit = newPuzzle.timeLimit;
          } else {
            delete targetPuzzle.timeLimit;
          }

          if (newPuzzle.memoryLimit !== undefined) {
            targetPuzzle.memoryLimit = newPuzzle.memoryLimit;
          } else {
            delete targetPuzzle.memoryLimit;
          }

          targetPuzzle.score = newPuzzle.score;

          // 4. 進入 subtasks，只允許覆蓋 score 與 visible/hidden 測資陣列。
          if (targetPuzzle.subtasks && newPuzzle.subtasks) {
            const minLength = Math.min(targetPuzzle.subtasks.length, newPuzzle.subtasks.length);
            for (let i = 0; i < minLength; i++) {
              targetPuzzle.subtasks[i].score = newPuzzle.subtasks[i].score;
              targetPuzzle.subtasks[i].visible = newPuzzle.subtasks[i].visible;
              targetPuzzle.subtasks[i].hidden = newPuzzle.subtasks[i].hidden;
            }
          }
          // 5. 忽略任何新增刪除題目、修改題號、特殊規則 (Special Rules) 的變更。
        }
      }
    }

    await SystemSettingsService.saveExamConfig(mergedConfig);
    return mergedConfig;
  }
}
