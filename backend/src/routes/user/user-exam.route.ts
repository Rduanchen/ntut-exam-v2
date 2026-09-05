import { Router } from "express";
import { UserController } from "../../controllers/user/user.controller";
import { decryptAndVerifyDeviceSession } from "../../middlewares/user-crypto.middleware";

const userExamRouter = Router();

// Get current exam state
userExamRouter.get("/status", UserController.getExamStatus);

/* Paper delivery: encrypted with the device key, but no session required.
 *
 * Delivery happens before anyone has logged in — that is the whole reason to
 * deliver early — so demanding a session would make it impossible exactly when
 * it is wanted. What comes back is ciphertext plus the metadata a machine needs
 * to probe its own toolchain; without the exam key there is no paper to read.
 * The service does its own decryption and replay check. */
userExamRouter.post("/config", UserController.getConfig);

// Exam key release. Phase-gated to IN_PROGRESS by exam-phase.middleware.
userExamRouter.post("/key", UserController.getExamKey);

// Environment-check report. Registration-only: it happens before any login.
userExamRouter.post("/environment-report", UserController.reportEnvironmentCheck);

// Secure missed messages retrieval, protected by GCM encryption and session tokens
userExamRouter.post("/messages", decryptAndVerifyDeviceSession, UserController.getMissedMessages);

export default userExamRouter;
