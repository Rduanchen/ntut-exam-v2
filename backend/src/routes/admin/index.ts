import { Router } from "express";
import { verifyAdminToken } from "../../middlewares/admin.middleware";
import adminSecurityRouter from "./admin-security.route";
import adminConfigRouter from "./admin-config.route";
import adminInitRouter from "./admin-init.route";
import adminLogRouter from "./admin-log.route";
import adminAnticheatRouter from "./admin-anticheat.route";
import adminSubmissionRouter from "./admin-submission.route";
import adminJudgerRouter from "./admin-judger.route";
import adminMessageRouter from "./admin-message.route";
import adminExamStateRouter from "./admin-exam-state.route";
import adminScoreRouter from "./admin-score.route";
import adminConnectionRouter from "./connection.route";

const adminRouter = Router();

// Verify admin authorization for all administrative endpoints
adminRouter.use(verifyAdminToken);

// Mount security operations directly under root prefix
adminRouter.use("/", adminSecurityRouter);

// Mount configuration and database initialization routes
adminRouter.use("/config", adminConfigRouter);
adminRouter.use("/init", adminInitRouter);
adminRouter.use("/log", adminLogRouter);
adminRouter.use("/anticheat", adminAnticheatRouter);
adminRouter.use("/submissions", adminSubmissionRouter);
adminRouter.use("/judger", adminJudgerRouter);
adminRouter.use("/messages", adminMessageRouter);
adminRouter.use("/exam-state", adminExamStateRouter);
adminRouter.use("/scores", adminScoreRouter);
adminRouter.use("/connection", adminConnectionRouter);

export default adminRouter;
