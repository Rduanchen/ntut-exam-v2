import { Router } from "express";
import userAuthRouter from "./user-auth.route";
import userExamRouter from "./user-exam.route";
import userLogRouter from "./user-log.route";
import userSubmissionRouter from "./user-submission.route";
import { loadTestIpMockMiddleware } from "../../middlewares/load-test-ip-mock.middleware";
import { examPhaseMiddleware } from "../../middlewares/exam-phase.middleware";

const userRouter = Router();

// Mount authentication and exam interaction sub-routers
userRouter.use(loadTestIpMockMiddleware);

// Refuse anything that does not belong to the current exam phase. Mounted at
// the root so an unclassified route fails closed rather than open.
userRouter.use(examPhaseMiddleware);
userRouter.use("/auth", userAuthRouter);
userRouter.use("/exam", userExamRouter);
userRouter.use("/log", userLogRouter);
userRouter.use("/submissions", userSubmissionRouter);

export default userRouter;
