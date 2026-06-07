import { Request, Response } from "express";
import { ScoreBoard } from "../../models/score-board.model";
import { User } from "../../models/user.model";
import logger from "../../utils/logger.util";

export class ScoreController {
  /**
   * Get all score boards including user info
   */
  static async getAllScores(req: Request, res: Response) {
    try {
      const scores = await ScoreBoard.findAll({
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['testId', 'name', 'ipAddress']
          }
        ]
      });
      res.json(scores);
    } catch (error: any) {
      logger.error(`Error in getAllScores: ${error.message}`);
      res.status(500).json({ error: "Failed to retrieve scores" });
    }
  }
}
