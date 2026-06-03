import { Request, Response } from 'express';
import { JudgerService } from '../../services/judger.service';
import { SocketService } from '../../sockets/socket.service';
import logger from '../../utils/logger.util';

export class AdminJudgerController {
  public static async judgeCode(req: Request, res: Response): Promise<void> {
    try {
      const { testId } = req.params;
      const { questionIds } = req.body;

      if (!testId) {
        res.status(400).json({ error: 'Bad Request: Missing testId' });
        return;
      }

      // Start the evaluation process
      const results = await JudgerService.judgeStudentSubmissions(testId, questionIds);

      // Trigger socket event to notify frontend
      SocketService.triggerScoreUpdateEvent(testId);

      res.status(200).json({
        message: 'Evaluation completed successfully',
        testId,
        results
      });
    } catch (error: any) {
      logger.error(`Admin judgeCode error: ${error.message}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
