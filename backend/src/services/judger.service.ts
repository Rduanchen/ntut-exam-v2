import pLimit from "p-limit";
import { Op } from "sequelize";
import { sequelize } from "../config/database.config";
import { Submission } from "../models/submission.model";
import { ScoreBoard } from "../models/score-board.model";
import { SystemSettingsService } from "./system-settings.service";
import { getEffectiveSpecialRules } from "./special-rules/rule-provider";
import { evaluateSpecialRules } from "./special-rules/engine";
import { piston, pistonJudger } from "piston-judger";
import logger from "../utils/logger.util";
import { ExamConfig, Puzzle } from "../schemas/config.schema";

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
    await JudgerService.syncScoreBoard(testId, latestResults);

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

    const evalResults = evaluateSpecialRules(effectiveRules, {
      sourceText: submission.codeContent,
      language: submission.language,
    });

    // Calculate multiplier from rules
    let multiplier = 1;
    for (const res of evalResults) {
      if (!res.passed) {
        const rule = effectiveRules.find(r => r.id === res.ruleId);
        multiplier *= rule?.multiplier ?? 1;
      }
    }

    // Prepare Judger options
    const options = {
      language: submission.language,
      timeLimit: puzzle.timeLimit,
      memoryLimit: puzzle.memoryLimit,
    };

    // Piston setup
    const client = piston({ server: "https://emkc.org/api/v2/piston" });
    const judger = pistonJudger({ client });

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
        const executeRes = await judger.execute(options.language, submission.codeContent, {
          stdin: tc.input,
          run_timeout: options.timeLimit,
        } as any);

        const judgeRes = judger.judge(executeRes as any, {
          expectedOutput: tc.output,
          timeLimit: options.timeLimit,
          memoryLimit: options.memoryLimit,
        });

        visibleResults.push(judgeRes);
        if (judgeRes.status !== "AC") isSubtaskPassed = false;
      }

      // Evaluate Hidden Testcases
      for (const tc of subtask.hidden) {
        const executeRes = await judger.execute(options.language, submission.codeContent, {
          stdin: tc.input,
          run_timeout: options.timeLimit,
        } as any);

        const judgeRes = judger.judge(executeRes as any, {
          expectedOutput: tc.output,
          timeLimit: options.timeLimit,
          memoryLimit: options.memoryLimit,
        });

        hiddenResults.push(judgeRes);
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
    const finalAutoScore = Math.floor(totalRawScore * multiplier);

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
  static async syncScoreBoard(testId: string, latestResults: Record<string, any>) {
    const t = await sequelize.transaction();
    try {
      // Fetch all submissions for the student to calculate global stats
      const allSubmissions = await Submission.findAll({
        where: { testId },
        transaction: t
      });

      // Calculate total score and puzzle passed stats
      let totalScore = 0;
      let passedPuzzleAmount = 0;
      let puzzleAmount = allSubmissions.length;

      // Note: Full subtask logic for total amounts would require exam config again,
      // but assuming the ScoreBoard logic here aggregates known submissions.
      // If full logic is needed, we'd iterate over examConfig.
      let subtaskAmount = 0;
      let passedSubtaskAmount = 0;

      for (const sub of allSubmissions as any[]) {
        totalScore += sub.autoScore || 0;
        
        // We consider a puzzle passed if it has a non-zero score for now
        // This can be refined based on specific AC criteria if required.
        if ((sub.autoScore || 0) > 0) {
          passedPuzzleAmount++;
        }
      }

      // Find existing ScoreBoard
      let scoreBoard = await ScoreBoard.findOne({ where: { testId }, transaction: t });

      if (!scoreBoard) {
        scoreBoard = await ScoreBoard.create(
          {
            testId,
            score: totalScore,
            lastSubmitTime: new Date(),
            subtaskAmount, // placeholder
            passedSubtaskAmount, // placeholder
            puzzleAmount,
            passedPuzzleAmount,
            puzzleResults: latestResults
          },
          { transaction: t }
        );
      } else {
        // Merge latestResults into existing puzzleResults
        const mergedResults = {
          ...scoreBoard.puzzleResults,
          ...latestResults
        };

        await scoreBoard.update(
          {
            score: totalScore,
            lastSubmitTime: new Date(),
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
