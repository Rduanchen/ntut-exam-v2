import { Router } from "express";
import userAuthRouter from "./user-auth.route";
import userExamRouter from "./user-exam.route";
import userLogRouter from "./user-log.route";
import userSubmissionRouter from "./user-submission.route";

const userRouter = Router();

// Mount authentication and exam interaction sub-routers
userRouter.use("/auth", userAuthRouter);
userRouter.use("/exam", userExamRouter);
userRouter.use("/log", userLogRouter);
userRouter.use("/submissions", userSubmissionRouter);

export default userRouter;
