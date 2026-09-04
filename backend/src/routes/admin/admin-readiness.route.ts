import { Router } from "express";
import { AdminReadinessController } from "../../controllers/admin/admin-readiness.controller";

const adminReadinessRouter = Router();

adminReadinessRouter.get("/", AdminReadinessController.getReadiness);

export default adminReadinessRouter;
