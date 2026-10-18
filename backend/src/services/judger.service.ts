import pLimit from "p-limit";
import { Op } from "sequelize";
import { sequelize } from "../config/database.config";
import { Submission } from "../models/submission.model";
import { ScoreBoard } from "../models/score-board.model";
import { SystemSettingsService } from "./system-settings.service";
import { getEffectiveSpecialRules } from "./special-rules/rule-provider";
import { evaluateSpecialRules } from "./special-rules/engine";
import { getPuzzleRuleMultiplier } from "./special-rules/multiplier";
import { piston, pistonJudger } from "piston-judger";
import logger from "../utils/logger.util";
import { ExamConfig, Puzzle } from "../schemas/config.schema";

const MAX_OUTPUT_LENGTH = 5000;

export class JudgerService {
  /**
   * Main entry point for evaluating student code.
   * @param testId Student test ID
   * @param questionIds Optional array of question IDs to grade. If omitted, grades all Pending submissions.
   */
  static async judgeStudentSubmissions(testId: string, questionIds?: string[]) {
    // 1. Fetch system config
    const examConfig: ExamConfig | null = await SystemSettingsService.getExamConfig();
    if (!examConfig) {
      throw new Error("Exam configuration is missing. Cannot proceed with judging.");
    }

    // 2. Query Pending submissions for the given testId (and optionally questionIds)
    const whereClause: any = { testId };
    if (questionIds && questionIds.length > 0) {
      whereClause.questionId = { [Op.in]: questionIds };
    }

    const submissions = await Submission.findAll({ where: whereClause });
    if (submissions.length === 0) {
      return { message: "No submissions found to judge.", results: {} };
    }

    // 3. Mark state as "Judging"
    await Submission.update(
      { status: "Judging" },
      { where: whereClause }
    );

    // 4. Concurrency limit setup
    const limit = pLimit(5); // Process up to 5 questions concurrently

    // Process submissions
    const latestResults: Record<string, any> = {};
    const tasks = submissions.map(sub =>
      limit(async () => {
        try {
          const result = await JudgerService.processSingleSubmission(sub, examConfig);
          latestResults[sub.questionId] = result;
        } catch (error: any) {
          logger.error(`Error processing submission ${sub.questionId} for ${testId}: ${error.message}`);
          await Submission.update(
            { status: "Error", autoScore: null },
            { where: { testId, questionId: sub.questionId } }
          );
        }
      })
    );

    await Promise.all(tasks);
    // 5. Sync results to ScoreBoard
    await JudgerService.syncScoreBoard(testId, latestResults, examConfig);

    return latestResults;
  }

  /**
   * Process a single submission (rules + piston grading).
   */
  static async processSingleSubmission(submission: Submission, examConfig: ExamConfig) {
    const puzzle = JudgerService.findPuzzleById(examConfig, submission.questionId);
    if (!puzzle) {
      throw new Error(`Puzzle config not found for question ${submission.questionId}`);
    }

    // Special Rules Processing
    const effectiveRules = getEffectiveSpecialRules({
      globalSpecialRules: examConfig.globalSpecialRules || [],
      puzzleSpecialRules: puzzle.specialRules || [],
    });

    const evalResults = await evaluateSpecialRules(effectiveRules, {
      sourceText: submission.codeContent,
      language: submission.language,
    });

    const multiplier = getPuzzleRuleMultiplier(evalResults, puzzle.multiplier ?? 0.5);

    // Map language to Piston compatible names
    const languageMap: Record<string, string> = {
      'Cpp': 'c++',
      'C': 'c',
      'Python': 'python',
      'Java': 'java',
      'JavaScript': 'javascript'
    };
    const mappedLanguage = languageMap[submission.language] || submission.language.toLowerCase();

    let resolvedTimeLimit = puzzle.timeLimit ?? examConfig.judgerSettings?.timeLimit ?? 10000;
    let resolvedMemoryLimit = puzzle.memoryLimit ?? examConfig.judgerSettings?.memoryLimit ?? 256;

    // Auto-detect if memory limit was entered in bytes instead of MB
    // If it's > 10240 (10 GB), it's highly likely they meant bytes.
    let finalMemoryLimitBytes = Math.floor(resolvedMemoryLimit * 1024 * 1024);
    if (resolvedMemoryLimit > 10240) {
      finalMemoryLimitBytes = Math.floor(resolvedMemoryLimit);
    }

    // Prepare Judger options
    const options = {
      language: mappedLanguage,
      timeLimit: Math.floor(resolvedTimeLimit),
      memoryLimit: finalMemoryLimitBytes,
      compareMode: examConfig.judgerSettings?.compareMode || 'loose',
    };

    // Piston setup
    const pistonUrl = process.env.PISTON_URL || "http://localhost:2000";
    const judger = pistonJudger({ server: pistonUrl });

    const resultPayload: any = {
      subtasks: [],
      specialRuleResults: evalResults
    };

    let totalRawScore = 0;

    // Subtask Grading
    for (const subtask of puzzle.subtasks) {
      let isSubtaskPassed = true;
      const visibleResults = [];
      const hiddenResults = [];

      // Evaluate Visible Testcases
      for (const tc of subtask.visible) {
        const executeRes: any = await judger.execute(options.language, submission.codeContent, {
          stdin: tc.input,
          run_timeout: options.timeLimit,
          run_memory_limit: options.memoryLimit,
        } as any);

        const truncateString = (str: any, limit: number = MAX_OUTPUT_LENGTH) => {
          if (typeof str !== 'string') return str;
          if (str.length <= limit) return str;
          return str.substring(0, limit) + "\\n...[Output Truncated]";
        };

        let judgeRes: any;
        if (executeRes.success === false || executeRes.error || !executeRes.run) {
          judgeRes = {
            status: "SE",
            message: truncateString(executeRes.error || "System Error during execution"),
            details: { isServerError: true }
          };
        } else {
          judgeRes = judger.judge(executeRes as any, {
            expectedOutput: tc.output,
            timeLimit: options.timeLimit,
            memoryLimit: options.memoryLimit,
            compareMode: options.compareMode,
          });
        }

        const formattedRes = {
          status: judgeRes.status,
          userOutput: truncateString(judgeRes.actualOutput || ""),
          expectedOutput: tc.output,
          time: judgeRes.details?.runInfo?.wallTime?.toString() || "0"
        };

        visibleResults.push(formattedRes);
        if (judgeRes.status !== "AC") isSubtaskPassed = false;
      }

      // Evaluate Hidden Testcases
      for (const tc of subtask.hidden) {
        const executeRes: any = await judger.execute(options.language, submission.codeContent, {
          stdin: tc.input,
          run_timeout: options.timeLimit,
          run_memory_limit: options.memoryLimit,
        } as any);

        const truncateString = (str: any, limit: number = MAX_OUTPUT_LENGTH) => {
          if (typeof str !== 'string') return str;
          if (str.length <= limit) return str;
          return str.substring(0, limit) + "\\n...[Output Truncated]";
        };

        let judgeRes: any;
        if (executeRes.success === false || executeRes.error || !executeRes.run) {
          judgeRes = {
            status: "SE",
            message: truncateString(executeRes.error || "System Error during execution"),
            details: { isServerError: true }
          };
        } else {
          judgeRes = judger.judge(executeRes as any, {
            expectedOutput: tc.output,
            timeLimit: options.timeLimit,
            memoryLimit: options.memoryLimit,
            compareMode: options.compareMode,
          });
        }

        const formattedRes = {
          status: judgeRes.status,
          userOutput: truncateString(judgeRes.actualOutput || ""),
          expectedOutput: tc.output,
          time: judgeRes.details?.runInfo?.wallTime?.toString() || "0"
        };

        hiddenResults.push(formattedRes);
        if (judgeRes.status !== "AC") isSubtaskPassed = false;
      }

      if (isSubtaskPassed) {
        totalRawScore += subtask.score;
      }

      resultPayload.subtasks.push({
        visible: visibleResults,
        hidden: hiddenResults
      });
    }

    // Final Auto Score Calculation
    const finalAutoScore = totalRawScore * multiplier;

    // Update Submission
    await Submission.update(
      { status: "Graded", autoScore: finalAutoScore },
      { where: { testId: submission.testId, questionId: submission.questionId } }
    );

    return resultPayload;
  }

  /**
   * Sync a student's total score to the ScoreBoard table.
   */
  static async syncScoreBoard(testId: string, latestResults: Record<string, any>, examConfig?: ExamConfig) {
    const t = await ScoreBoard.sequelize!.transaction();
    try {
      const config = examConfig || await SystemSettingsService.getExamConfig();
      if (!config) {
        throw new Error("Exam configuration is missing. Cannot sync ScoreBoard.");
      }

      // Fetch all submissions for the student to calculate global stats
      const allSubmissions = await Submission.findAll({
        where: { testId },
        transaction: t
      });

      const submissionMap = new Map<string, Submission>();
      for (const sub of allSubmissions) {
        submissionMap.set(sub.questionId, sub);
      }

      // Find existing ScoreBoard to merge results
      let scoreBoard = await ScoreBoard.findOne({ where: { testId }, transaction: t });
      const mergedResults: Record<string, any> = {
        ...(scoreBoard ? scoreBoard.puzzleResults : {}),
        ...latestResults
      };

      // Calculate total score and puzzle/subtask stats
      let totalScore = 0;
      let puzzleAmount = 0;
      let passedPuzzleAmount = 0;
      let subtaskAmount = 0;
      let passedSubtaskAmount = 0;

      for (const section of config.sections) {
        let sectionScore = 0;
        for (const puzzle of section.puzzles) {
          puzzleAmount++;

          const sub = submissionMap.get(puzzle.id);
          if (sub) {
            const puzzleScore = sub.autoScore || 0;
            sectionScore += puzzleScore;
            if (puzzleScore > 0) {
              passedPuzzleAmount++;
            }
          }

          // Count subtasks and passed subtasks using mergedResults
          const puzzleSubtaskCount = puzzle.subtasks ? puzzle.subtasks.length : 0;
          subtaskAmount += puzzleSubtaskCount;

          const puzzleIndex = config.sections.flatMap((s: any) => s.puzzles).findIndex((p: any) => p.id === puzzle.id);
          const pRes = mergedResults[puzzle.id] || (puzzleIndex !== -1 ? mergedResults[`Q${puzzleIndex + 1}`] : undefined);

          if (pRes && pRes.subtasks) {
            for (const subtaskRes of pRes.subtasks) {
              const visiblePassed = !subtaskRes.visible || subtaskRes.visible.every((c: any) => (c.status || c.statusCode) === 'AC');
              const hiddenPassed = !subtaskRes.hidden || subtaskRes.hidden.every((c: any) => (c.status || c.statusCode) === 'AC');
              if (visiblePassed && hiddenPassed) {
                passedSubtaskAmount++;
              }
            }
          }
        }

        // Cap section score
        const cappedSectionScore = (section.maxScore !== undefined && section.maxScore !== null && section.maxScore >= 0)
          ? Math.min(sectionScore, section.maxScore)
          : sectionScore;
        totalScore += cappedSectionScore;
      }

      if (!scoreBoard) {
        scoreBoard = await ScoreBoard.create(
          {
            testId,
            score: Math.round(totalScore),
            lastSubmitTime: new Date(),
            subtaskAmount,
            passedSubtaskAmount,
            puzzleAmount,
            passedPuzzleAmount,
            puzzleResults: mergedResults
          },
          { transaction: t }
        );
      } else {
        await scoreBoard.update(
          {
            score: Math.round(totalScore),
            lastSubmitTime: new Date(),
            subtaskAmount,
            passedSubtaskAmount,
            puzzleAmount,
            passedPuzzleAmount,
            puzzleResults: mergedResults
          },
          { transaction: t }
        );
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      logger.error(`Error in syncScoreBoard for testId ${testId}: ${error}`);
      throw error;
    }
  }

  /**
   * Utility to find a puzzle inside the exam config.
   */
  private static findPuzzleById(examConfig: ExamConfig, questionId: string): Puzzle | undefined {
    for (const section of examConfig.sections) {
      for (const puzzle of section.puzzles) {
        if (puzzle.id === questionId) {
          return puzzle;
        }
      }
    }
    return undefined;
  }
}
