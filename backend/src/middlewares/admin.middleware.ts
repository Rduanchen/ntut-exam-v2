import { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/http-error";

/**
 * Middleware protecting admin routes.
 * Checks Bearer token or x-admin-token against configured ADMIN_TOKEN.
 */
export function verifyAdminToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : (req.headers["x-admin-token"] as string);

  const adminSecret = process.env.ADMIN_TOKEN || "admin-secret";

  if (!token || token !== adminSecret) {
    return next(new HttpError(401, "Unauthorized: Invalid admin token"));
  }

  // Inject administrative user profile
  req.admin = {
    id: "admin-system",
    role: "SUPER_ADMIN",
    permissions: ["RESET_DEVICE", "RESET_BINDING"]
  };

  next();
}

/**
 * Factory function creating a permission check middleware.
 */
export function requirePermission(requiredPermission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.admin) {
      return next(new HttpError(401, "Unauthorized: Admin identity missing"));
    }

    const { role, permissions } = req.admin;
    const hasPermission = role === "SUPER_ADMIN" || permissions.includes(requiredPermission);

    if (!hasPermission) {
      return next(new HttpError(403, `Forbidden: Missing required permission "${requiredPermission}"`));
    }

    next();
  };
}
