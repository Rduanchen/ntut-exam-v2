import { Router } from "express";
import { AdminRehearsalController } from "../../controllers/admin/admin-rehearsal.controller";

/**
 * Mounted under the admin router, so `verifyAdminToken` guards all of it.
 *
 * That matters more here than elsewhere: this is the one endpoint in the
 * system whose successful completion erases the machine.
 */
const adminRehearsalRouter = Router();

adminRehearsalRouter.get("/profile", AdminRehearsalController.profile);
adminRehearsalRouter.post("/", AdminRehearsalController.start);
adminRehearsalRouter.get("/latest", AdminRehearsalController.latest);
adminRehearsalRouter.get("/:runId", AdminRehearsalController.status);

export default adminRehearsalRouter;
