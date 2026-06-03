import { Router } from "express";
import { UserController } from "../../controllers/user/user.controller";
import { decryptAndVerifyDeviceSession } from "../../middlewares/user-crypto.middleware";

const userExamRouter = Router();

// Secure exam testcase retrieval, protected by GCM encryption and session tokens
userExamRouter.post("/testcase", decryptAndVerifyDeviceSession, UserController.getTestCase);

export default userExamRouter;
