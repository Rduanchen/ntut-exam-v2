import { Router } from "express";
import { AdminSecurityController } from "../../controllers/admin/admin-security.controller";
import { requirePermission } from "../../middlewares/admin.middleware";

const adminSecurityRouter = Router();

// Get all devices connection status
adminSecurityRouter.get(
  "/device",
  AdminSecurityController.getDevices
);

// Delete device keys (requires RESET_DEVICE permission)
adminSecurityRouter.delete(
  "/device/:deviceUuid",
  requirePermission("RESET_DEVICE"),
  AdminSecurityController.deleteDeviceKey
);

// Reset user device binding (requires RESET_BINDING permission)
adminSecurityRouter.put(
  "/users/:testId/reset-device",
  requirePermission("RESET_BINDING"),
  AdminSecurityController.resetUserDeviceBinding
);

export default adminSecurityRouter;
