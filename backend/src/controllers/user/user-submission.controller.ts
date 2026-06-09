import { Request, Response } from 'express';
import { CodeStorageService } from '../../services/code-storage.service';
import { ExamConfigParserService } from '../../services/exam-config-parser.service';
import { ScoreBoard } from '../../models/score-board.model';
import logger from '../../utils/logger.util';

export class UserSubmissionController {
  public static async submitCode(req: Request, res: Response): Promise<void> {
    try {
      // Get testId and decrypted body from userSession populated by decryptAndVerifyDeviceSession middleware
      const testId = (req as any).userSession?.testId || (req as any).user?.testId;
      const body = (req as any).userSession?.decryptedBody || req.body;

      const { questionId, language, codeContent } = body || {};

      if (!testId) {
        res.status(401).json({ error: 'Unauthorized: Missing testId' });
        return;
      }

      if (!questionId || !language || !codeContent) {
        res.status(400).json({ error: 'Bad Request: Missing required fields' });
        return;
      }

      const isValidQuestion = await ExamConfigParserService.questionExists(questionId);
      if (!isValidQuestion) {
        res.status(400).json({ error: `Bad Request: Invalid questionId '${questionId}'` });
        return;
      }

      await CodeStorageService.upsertSubmission(testId, { questionId, language, codeContent });

      res.status(200).json({ success: true, message: 'Submission saved successfully' });
    } catch (error: any) {
      logger.error(`User submitCode error: ${error.message}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  public static async submitScore(req: Request, res: Response): Promise<void> {
    try {
      const testId = (req as any).userSession?.testId || (req as any).user?.testId;
      const body = (req as any).userSession?.decryptedBody || req.body;

      const { score, puzzleResults, subtaskAmount, passedSubtaskAmount, puzzleAmount, passedPuzzleAmount } = body || {};

      if (!testId) {
        res.status(401).json({ error: 'Unauthorized: Missing testId' });
        return;
      }

      if (score === undefined) {
        res.status(400).json({ error: 'Bad Request: Missing score' });
        return;
      }

      const scoreBoard = await ScoreBoard.findOne({ where: { testId } });
      const updateData = {
        score,
        lastSubmitTime: new Date(),
        ...(puzzleResults !== undefined && { puzzleResults }),
        ...(subtaskAmount !== undefined && { subtaskAmount }),
        ...(passedSubtaskAmount !== undefined && { passedSubtaskAmount }),
        ...(puzzleAmount !== undefined && { puzzleAmount }),
        ...(passedPuzzleAmount !== undefined && { passedPuzzleAmount })
      };

      if (scoreBoard) {
        await scoreBoard.update(updateData);
      } else {
        await ScoreBoard.create({ testId, ...updateData });
      }

      res.status(200).json({ success: true, message: 'Score saved successfully' });
    } catch (error: any) {
      logger.error(`User submitScore error: ${error.message}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  public static async getMySubmissions(req: Request, res: Response): Promise<void> {
    try {
      const testId = (req as any).userSession?.testId || (req as any).user?.testId;

      if (!testId) {
        res.status(401).json({ error: 'Unauthorized: Missing testId' });
        return;
      }

      const submissions = await CodeStorageService.getSubmissions(testId);
      
      res.status(200).json(submissions);
    } catch (error: any) {
      logger.error(`User getMySubmissions error: ${error.message}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
