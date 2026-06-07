import { SystemSettingsService } from "./system-settings.service";
import logger from "../utils/logger.util";

export class ExamConfigParserService {
  /**
   * Fetch the global exam configuration directly.
   */
  public static async getConfig(): Promise<any | null> {
    try {
      return await SystemSettingsService.getSetting<any>("exam_config");
    } catch (err: any) {
      logger.warn(`Failed to retrieve exam_config: ${err.message}`);
      return null;
    }
  }

  /**
   * Find a specific puzzle (question) within the configuration by its ID.
   * If an existing configuration object is provided, it uses that instead of fetching.
   */
  public static async getPuzzleById(questionId: string, providedConfig?: any): Promise<any | null> {
    const config = providedConfig || await this.getConfig();
    if (!config?.sections) {
      return null;
    }

    for (const section of config.sections) {
      if (section.puzzles) {
        const found = section.puzzles.find((p: any) => p.id === questionId);
        if (found) {
          return found;
        }
      }
    }
    
    return null;
  }

  /**
   * Check if a specific puzzle (question) exists in the configuration.
   */
  public static async questionExists(questionId: string, providedConfig?: any): Promise<boolean> {
    const puzzle = await this.getPuzzleById(questionId, providedConfig);
    return puzzle !== null;
  }
}
