import { Router } from "express";
import { ConnectionController } from "../../controllers/admin/connection.controller";

const router = Router();

router.get("/settings", ConnectionController.getSettings);
router.post("/settings", ConnectionController.updateSettings);

router.get("/devices", ConnectionController.getDevices);
router.post("/devices/:uuid/unbind", ConnectionController.unbindDevice);

router.get("/requests", ConnectionController.getRequests);
router.post("/requests/:id/approve", ConnectionController.approveRequest);
router.post("/requests/:id/reject", ConnectionController.rejectRequest);

router.post("/unblock", ConnectionController.manualUnblock);

export default router;
