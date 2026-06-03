import { Request } from "express";

declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: string;
        role: "SUPER_ADMIN" | "TA";
        permissions: string[];
      };
      userSession?: {
        testId: string;
        deviceUuid: string;
        decryptedBody?: any;
      };
    }
  }
}
