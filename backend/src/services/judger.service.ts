import { Op } from "sequelize";
import { sequelize } from "../config/database.config";
import { Submission } from "../models/submission.model";
import { ScoreBoard } from "../models/score-board.model";
import { SystemSettingsService } from "./system-settings.service";
import { getEffectiveSpecialRules } from "./special-rules/rule-provider";
import { evaluateSpecialRules } from "./special-rules/engine";
import {
  pistonJudger,
  FaultAttribution,
  StatusCode,
  type JudgeResult,
} from "piston-judger";
import { applyJudgeSettings } from "./judge-limiter";
import { valuesOf, type JudgeSettings } from "../config/judge.config";
import logger from "../utils/logger.util";
import { ExamConfig, Puzzle } from "../schemas/config.schema";
import { JudgeExecutionService } from "./judge-execution.service";
import { truncateJudgerOutput } from "../utils/judger-output.util";

export interface TestCaseResult {
  status: string;
  attribution: string;
  message: string;
  userOutput: string;
  expectedOutput: string;
  time: string;
}

export interface PuzzleResult {
  subtasks: Array<{ visible: TestCaseResult[]; hidden: TestCaseResult[] }>;
  specialRuleResults: unknown;
}

export interface JudgeOptionsResolved {
  language: string;
  timeLimit: number;
  memoryLimit: number;
  compareMode: string;
}


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

    /* 2. Query ALL submissions for this student, not only pending ones.
     *
     * The comment here used to claim this selected pending submissions. It
     * never did — there is no status filter — so every trigger re-judges every
     * question, already-graded ones included, multiplying the load this
     * feature exists to survive.
     *
     * The comment is corrected rather than the behaviour: a TA pressing
     * "re-judge" plausibly wants everything re-judged, so narrowing the query
     * is a semantic change that belongs to its own decision, not to this one. */
    const whereClause: any = { testId };
    if (questionIds && questionIds.length > 0) {
      whereClause.questionId = { [Op.in]: questionIds };
    }

    const submissions = await Submission.findAll({ where: whereClause });
    if (submissions.length === 0) {
      return { message: "No submissions found to judge.", results: {}, graded: 0, systemFailures: 0 };
    }

    // 3. Mark state as "Judging"
    await Submission.update(
      { status: "Judging" },
      { where: whereClause }
    );

    /* 4. No limiter here.
     *
     * The ceiling lives on the execution call itself (see judge-limiter), which
     * is what makes it hold however callers batch work. A limiter constructed
     * here — as one was — bounds nothing: it is per request, so N simultaneous
     * requests admitted N times its value, and the system had no ceiling at all.
     */
    // Process submissions
    const latestResults: Record<string, any> = {};
    let systemFailures = 0;
    const tasks = submissions.map(sub =>
      (async () => {
        try {
          const outcome = await JudgerService.processSingleSubmission(sub, examConfig);
          latestResults[sub.questionId] = outcome.result;
          if (outcome.systemFailure) systemFailures += 1;
        } catch (error: any) {
          logger.error(`Error processing submission ${sub.questionId} for ${testId}: ${error.message}`);
          await Submission.update(
            { status: "SystemError", autoScore: null },
            { where: { testId, questionId: sub.questionId } }
          );
          systemFailures += 1;
        }
      })()
    );

    await Promise.all(tasks);
    // 5. Sync results to ScoreBoard
    await JudgerService.syncScoreBoard(testId, latestResults, examConfig);

    return { results: latestResults, systemFailures, graded: submissions.length - systemFailures };
  }

  /**
   * Run one test case, retrying only what is worth retrying.
   *
   * A system-attributed verdict is retried because it says nothing about the
   * submission — the same code may well pass on the next attempt. A
   * submission-attributed verdict is never retried: it is deterministic, so a
   * retry cannot change it and merely consumes capacity at the moment capacity
   * is scarcest.
   *
   * Every attempt, retries included, goes through the execution ceiling. A
   * retry that bypassed it would add load exactly when the machine is already
   * failing, which is how a transient overload becomes a sustained one.
   */
  private static async runTestCase(
    judger: ReturnType<typeof pistonJudger>,
    options: JudgeOptionsResolved,
    settings: JudgeSettings,
    code: string,
    testCase: { input: string; output: string },
  ): Promise<JudgeResult> {
    const execution = new JudgeExecutionService(judger);
    const { verdict } = await execution.executeAndJudge({
      language: options.language,
      code,
      execute: {
          stdin: testCase.input,
          run_timeout: options.timeLimit,
          run_memory_limit: options.memoryLimit,
          compile_timeout: settings.compileTimeout,
          compile_memory_limit: settings.compileMemoryLimit,
      },
      judge: {
        expectedOutput: testCase.output,
        memoryLimit: options.memoryLimit,
        compareMode: options.compareMode,
      },
      maxSystemRetries: settings.maxSystemRetries,
    });
    return verdict;
  }

  /**
   * Process a single submission (rules + piston grading).
   */
  static async processSingleSubmission(
    submission: Submission,
    examConfig: ExamConfig,
  ): Promise<{ result: PuzzleResult; systemFailure: boolean }> {
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

    // Map language to Piston compatible names
    const languageMap: Record<string, string> = {
      'Cpp': 'c++',
      'C': 'c',
      'Python': 'python',
      'Java': 'java',
      'JavaScript': 'javascript'
    };
    const mappedLanguage = languageMap[submission.language] || submission.language.toLowerCase();

    const resolvedTimeLimit = puzzle.timeLimit ?? examConfig.judgerSettings?.timeLimit ?? 10000;
    const resolvedMemoryLimit = puzzle.memoryLimit ?? examConfig.judgerSettings?.memoryLimit ?? 256;

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

    /* Applies the ceiling as a side effect, so a configuration upload takes
     * effect on the next run rather than on the next restart. */
    const judgeSettings = valuesOf(
      applyJudgeSettings(examConfig.judgerSettings as Partial<JudgeSettings>),
    );

    const resultPayload: PuzzleResult = {
      subtasks: [],
      specialRuleResults: evalResults,
    };

    let totalRawScore = 0;
    /* Set when any test case ends in a system-attributed verdict that survived
     * its retries. Such a submission has not been evaluated, so it must not be
     * scored -- neither as a pass nor as a failure. */
    let systemFailure: JudgeResult | null = null;

    // Subtask Grading
    for (const subtask of puzzle.subtasks) {
      let isSubtaskPassed = true;
      const visibleResults: TestCaseResult[] = [];
      const hiddenResults: TestCaseResult[] = [];

      for (const [cases, sink] of [
        [subtask.visible, visibleResults],
        [subtask.hidden, hiddenResults],
      ] as const) {
        for (const tc of cases) {
          const verdict = await JudgerService.runTestCase(
            judger,
            options,
            judgeSettings,
            submission.codeContent,
            tc,
          );

          if (verdict.attribution === FaultAttribution.SYSTEM) {
            systemFailure ??= verdict;
          }

          sink.push({
            status: verdict.status,
            attribution: verdict.attribution,
            message: truncateJudgerOutput(verdict.message),
            userOutput: truncateJudgerOutput(verdict.actualOutput ?? ""),
            expectedOutput: tc.output,
            time: verdict.details?.run?.wall_time?.toString() ?? "0",
          });

          if (verdict.status !== StatusCode.AC) isSubtaskPassed = false;
        }
      }

      if (isSubtaskPassed) {
        totalRawScore += subtask.score;
      }

      resultPayload.subtasks.push({ visible: visibleResults, hidden: hiddenResults });
    }

    /* A submission the system could not evaluate is not a submission that
     * scored zero. Recording it as graded would take marks from a student for
     * a machine's failure, which is the entire defect this feature removes. */
    if (systemFailure) {
      logger.warn(
        `[Judger] ${submission.testId}/${submission.questionId} could not be judged: ` +
          `${systemFailure.status} — ${systemFailure.message}`,
      );
      await Submission.update(
        { status: "SystemError", autoScore: null },
        { where: { testId: submission.testId, questionId: submission.questionId } },
      );
      return { result: resultPayload, systemFailure: true };
    }

    // Final Auto Score Calculation
    const finalAutoScore = Math.floor(totalRawScore * multiplier);

    await Submission.update(
      { status: "Graded", autoScore: finalAutoScore },
      { where: { testId: submission.testId, questionId: submission.questionId } },
    );

    return { result: resultPayload, systemFailure: false };

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
          const sub = submissionMap.get(puzzle.id);

          /* A submission the system could not evaluate is excluded from the
           * denominators entirely.
           *
           * Leaving it in would count it as "not passed", which is precisely
           * "recorded as an incorrect answer" — the thing this feature exists
           * to prevent. A TA reading 3/5 has no way to know one of the two
           * failures was the machine's. The count of system failures is
           * reported separately, on the judging job's outcome. */
          if (sub?.status === "SystemError") {
            continue;
          }

          puzzleAmount++;

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
            score: totalScore,
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
            score: totalScore,
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
