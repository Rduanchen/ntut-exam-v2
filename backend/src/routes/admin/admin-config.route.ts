import { Router } from "express";
import { ExamConfigController } from "../../controllers/admin/exam-config.controller";

const adminConfigRouter = Router();

// Admin routes for global exam configuration CRUD operations
adminConfigRouter.post("/", ExamConfigController.createOrOverwriteConfig);
adminConfigRouter.put("/", ExamConfigController.updateConfig);
adminConfigRouter.get("/", ExamConfigController.getConfig);

// The paper as a file, for machines that cannot reach the backend.
adminConfigRouter.get("/offline-bundle", ExamConfigController.exportOfflineBundle);

export default adminConfigRouter;
