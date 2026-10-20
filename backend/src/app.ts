import "reflect-metadata";
import express from "express";
import cors from "cors";

import { sequelize } from "./config/database.config";
import logger from "./utils/logger.util";

import userRouter from "./routes/user";
import adminRouter from "./routes/admin";

/**
 * Assemble the Express application.
 *
 * This function performs composition only — middleware, routers, and the global
 * error handler. It deliberately does NOT connect to the database, probe the
 * Piston server, create an HTTP server, bind a port, or initialise socket
 * namespaces; those belong to the process lifecycle in `index.ts`.
 *
 * Keeping composition separate is what allows tests to drive the real
 * application in-process via supertest.
 */
export function createApp(audience: "admin" | "user" | "both" = "both"): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true, limit: "5mb" }));

  if (audience !== "admin") app.use("/user", userRouter);
  if (audience !== "user") app.use("/admin", adminRouter);

  app.get("/health", async (req, res) => {
    try {
      await sequelize.authenticate();
      res.status(200).json({
        status: "UP",
        database: "UP",
        loadTestMode: process.env.LOAD_TEST_MODE || "NOT SET",
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error(`Health check database error: ${error.message}`);
      res.status(500).json({
        status: "DOWN",
        database: "DOWN",
        error: error.message || String(error),
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.get("/", (req, res) => {
    res.send("NTUT Exam Host Backend is running.");
  });

  app.use(
    (
      err: any,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      const status = err.statusCode || err.status || 500;
      const message = err.message || "Internal Server Error";
      if (status >= 500) {
        logger.error(`Unhandled Server Error: ${err.message || err}`, {
          stack: err.stack,
        });
      }
      res.status(status).json({ error: message, code: err.code });
    },
  );

  return app;
}

export default createApp;
