import "dotenv/config";
import "reflect-metadata";
import { initDatabase } from "./config/database.config";
import logger from "./utils/logger.util";

import { createApp } from "./app";

import http from "http";
import { Server } from "socket.io";
import SocketService from "./sockets/socket.service";
import MessageSocketService from "./sockets/message-socket.service";

import { checkPistonServer } from "./constants/piston.config";
import { JudgeStartupService } from "./services/judge-startup.service";
import { applyJudgeSettings } from "./services/judge-limiter";
import { SystemSettingsService } from "./services/system-settings.service";
import { DeployTestStartupService } from "./services/deploy-test-startup.service";
import { RehearsalStartupService } from "./services/rehearsal-startup.service";

function configuredPort(name: string, fallback: string): number {
  const raw = process.env[name] || fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

const adminPort = configuredPort("ADMIN_PORT", process.env.PORT || "3000");
const userPort = configuredPort("USER_PORT", "3001");
if (adminPort === userPort) throw new Error("ADMIN_PORT and USER_PORT must differ");

const adminServer = http.createServer(createApp("admin"));
const userServer = http.createServer(createApp("user"));
SocketService.initialize(new Server(adminServer, { cors: { origin: "*" } }).of("/admin"));
MessageSocketService.initialize(new Server(userServer, { cors: { origin: "*" } }).of("/user"));

function listen(server: http.Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function startServer() {
  try {
    if (!process.env.ADMIN_TOKEN || ["admin", "admin-secret"].includes(process.env.ADMIN_TOKEN)) {
      throw new Error("Set a non-default ADMIN_TOKEN before starting the backend");
    }
    await initDatabase();

    /* Repair judging state left by a previous process before anything can
     * observe it. A crash mid-judge otherwise leaves submissions permanently
     * "being judged" by a process that no longer exists, and nothing in the
     * system ever revisits them. */
    await JudgeStartupService.run();
    await DeployTestStartupService.run();
    /* Erases the half-built exam a killed rehearsal leaves behind. Safe only
     * because the run record claims ownership before the first mutation. */
    await RehearsalStartupService.run();

    /* Apply the stored concurrency ceiling now, so the first judging run of
     * the day is bounded rather than the second. */
    const examConfig = await SystemSettingsService.getExamConfig().catch(() => null);
    applyJudgeSettings(examConfig?.judgerSettings);

    await checkPistonServer();
    const adminHost = process.env.ADMIN_LISTEN_HOST || "127.0.0.1";
    await Promise.all([
      listen(adminServer, adminPort, adminHost),
      listen(userServer, userPort, "0.0.0.0"),
    ]);
    logger.info(`Admin API is running on http://${adminHost}:${adminPort}`);
    logger.info(`User API is running on port ${userPort}`);

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
  } catch (error: any) {
    logger.error(`Failed to start the server: ${error.message}`);
    process.exit(1);
  }
}

startServer();
