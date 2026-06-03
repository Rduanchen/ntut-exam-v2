import { Router } from "express";
import { verifyAdminToken } from "../../middlewares/admin.middleware";
import adminSecurityRouter from "./admin-security.route";
import adminConfigRouter from "./admin-config.route";
import adminInitRouter from "./admin-init.route";
import adminLogRouter from "./admin-log.route";
import adminAnticheatRouter from "./admin-anticheat.route";
import adminSubmissionRouter from "./admin-submission.route";
import adminJudgerRouter from "./admin-judger.route";

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

export default adminRouter;
