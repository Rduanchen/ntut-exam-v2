import { Router } from "express";
import { UserController } from "../../controllers/user/user.controller";
import { decryptAndVerifyDeviceSession } from "../../middlewares/user-crypto.middleware";

const userExamRouter = Router();

// Get current exam state
userExamRouter.get("/status", UserController.getExamStatus);

// Secure exam config retrieval, protected by GCM encryption and session tokens
userExamRouter.post("/config", decryptAndVerifyDeviceSession, UserController.getConfig);

// Environment-check report. Registration-only: it happens before any login.
userExamRouter.post("/environment-report", UserController.reportEnvironmentCheck);

// Secure missed messages retrieval, protected by GCM encryption and session tokens
userExamRouter.post("/messages", decryptAndVerifyDeviceSession, UserController.getMissedMessages);

export default userExamRouter;
