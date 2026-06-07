import { Router } from "express";
import { ScoreController } from "../../controllers/admin/score.controller";

const adminScoreRouter = Router();

adminScoreRouter.get("/", ScoreController.getAllScores);

export default adminScoreRouter;
