import { Router } from "express";
import { ExamConfigController } from "../../controllers/admin/exam-config.controller";

const adminInitRouter = Router();

// Admin routes for database initialization and resetting operations
adminInitRouter.post("/", ExamConfigController.initializeDatabase);
adminInitRouter.post("/reset", ExamConfigController.resetDatabase);
adminInitRouter.get("/init-status", ExamConfigController.getSystemInitStatus);

export default adminInitRouter;
