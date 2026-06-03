import { Router } from "express";
import { ExamConfigController } from "../../controllers/admin/exam-config.controller";

const adminConfigRouter = Router();

// Admin routes for global exam configuration CRUD operations
adminConfigRouter.post("/", ExamConfigController.createOrOverwriteConfig);
adminConfigRouter.put("/", ExamConfigController.updateConfig);
adminConfigRouter.get("/", ExamConfigController.getConfig);

export default adminConfigRouter;
