import { Request, Response } from 'express';
import { CodeStorageService } from '../../services/code-storage.service';
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

      await CodeStorageService.upsertSubmission(testId, { questionId, language, codeContent });
      
      res.status(200).json({ success: true, message: 'Submission saved successfully' });
    } catch (error: any) {
      logger.error(`User submitCode error: ${error.message}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
