import { Request, Response } from 'express';
import { CodeStorageService } from '../../services/code-storage.service';
import logger from '../../utils/logger.util';

export class AdminSubmissionController {
  public static async getSubmittedStudents(req: Request, res: Response): Promise<void> {
    try {
      const students = await CodeStorageService.getSubmittedStudents();
      res.status(200).json(students);
    } catch (error: any) {
      logger.error(`Admin getSubmittedStudents error: ${error.message}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  public static async getStudentCode(req: Request, res: Response): Promise<void> {
    try {
      const { testId } = req.params;
      const { questionIds } = req.query;

      if (!testId) {
        res.status(400).json({ error: 'Bad Request: Missing testId' });
        return;
      }

      let questionIdsArray: string[] | undefined = undefined;
      if (typeof questionIds === 'string' && questionIds.trim() !== '') {
        questionIdsArray = questionIds.split(',');
      }

      const submissions = await CodeStorageService.getSubmissions(testId, questionIdsArray);
      res.status(200).json(submissions);
    } catch (error: any) {
      logger.error(`Admin getStudentCode error: ${error.message}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  public static async getSubmittedList(req: Request, res: Response): Promise<void> {
    try {
      const { testId } = req.params;
      
      if (!testId) {
        res.status(400).json({ error: 'Bad Request: Missing testId' });
        return;
      }

      const submittedIds = await CodeStorageService.getSubmittedQuestionIds(testId);
      res.status(200).json(submittedIds);
    } catch (error: any) {
      logger.error(`Admin getSubmittedList error: ${error.message}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
