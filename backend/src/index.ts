import "reflect-metadata";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { initDatabase, sequelize } from "./config/database.config";
import logger from "./utils/logger.util";

import userRouter from "./routes/user";
import adminRouter from "./routes/admin";

import http from "http";
import { Server } from "socket.io";
import SocketService from "./sockets/socket.service";
import MessageSocketService from "./sockets/message-socket.service";

import PISTON_CONFIG from "./constants/piston.config";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use("/user", userRouter);
app.use("/admin", adminRouter);

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
    res.status(status).json({ error: message });
  },
);

// test if piston server has started

async function testPistonServer() {
  try {
    const response = await fetch(PISTON_CONFIG.url, {
      method: "GET",
    });
    if (response.ok) {
      logger.info("Piston server is running");
    } else {
      logger.warn("Piston server is not running");
    }
  } catch (error: any) {
    logger.error(`Failed to start the server: ${error.message}`);
  }
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
SocketService.initialize(io.of("/admin"));
MessageSocketService.initialize(io.of("/user"));

async function startServer() {
  try {
    await initDatabase();
    server.listen(port, () => {
      logger.info(`Server is running on http://localhost:${port}`);

      // Print prominent warning if LOAD_TEST_MODE is enabled
      const loadTestMode = process.env.LOAD_TEST_MODE;
      if (loadTestMode && loadTestMode !== 'false') {
        const border = '='.repeat(70);
        console.warn(`\n\x1b[41m\x1b[37m${border}\x1b[0m`);
        console.warn(`\x1b[41m\x1b[37m  ⚠️  WARNING: LOAD_TEST_MODE = "${loadTestMode}"${' '.repeat(Math.max(0, 44 - loadTestMode.length))}\x1b[0m`);
        console.warn(`\x1b[41m\x1b[37m${border}\x1b[0m`);
        if (loadTestMode === 'pure') {
          console.warn(`\x1b[33m  → 加密驗證已完全繞過，任何帳號皆可登入\x1b[0m`);
          console.warn(`\x1b[33m  → IP 可透過 Header 偽造\x1b[0m`);
        } else if (loadTestMode === 'simulation') {
          console.warn(`\x1b[33m  → 不存在的帳號將被自動建立並允許登入\x1b[0m`);
          console.warn(`\x1b[33m  → IP 可透過 Header 偽造\x1b[0m`);
        } else if (loadTestMode === 'true') {
          console.warn(`\x1b[33m  → IP 可透過 Header 偽造\x1b[0m`);
        }
        console.warn(`\x1b[33m  → 請勿在正式考試中使用此模式！\x1b[0m`);
        console.warn(`\x1b[33m  → 如需關閉請移除 backend/.env 中的 LOAD_TEST_MODE\x1b[0m`);
        console.warn(`\x1b[41m\x1b[37m${border}\x1b[0m\n`);
      }
    });
  } catch (error: any) {
    logger.error(`Failed to start the server: ${error.message}`);
    process.exit(1);
  }
}

startServer();
