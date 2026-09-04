import "reflect-metadata";
import dotenv from "dotenv";
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

dotenv.config();

const app = createApp();
const port = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
SocketService.initialize(io.of("/admin"));
MessageSocketService.initialize(io.of("/user"));

async function startServer() {
  try {
    await initDatabase();

    /* Repair judging state left by a previous process before anything can
     * observe it. A crash mid-judge otherwise leaves submissions permanently
     * "being judged" by a process that no longer exists, and nothing in the
     * system ever revisits them. */
    await JudgeStartupService.run();
    await DeployTestStartupService.run();

    /* Apply the stored concurrency ceiling now, so the first judging run of
     * the day is bounded rather than the second. */
    const examConfig = await SystemSettingsService.getExamConfig().catch(() => null);
    applyJudgeSettings(examConfig?.judgerSettings);

    await checkPistonServer();
    // 移除強制綁定 0.0.0.0，因為我們現在有 IP 正規化 (normalizeIp) 處理了
    server.listen(typeof port === 'string' ? parseInt(port) : port, () => {
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
