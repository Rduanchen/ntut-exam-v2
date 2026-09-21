import { vi, beforeAll, afterAll, beforeEach } from 'vitest';
import logger from '../src/utils/logger.util';

// Force in-memory SQLite database before any imports
process.env.DB_STORAGE = ':memory:';

// Fixed admin token for integration tests. `verifyAdminToken` compares against
// this, so `adminRequest()` can authenticate without touching the database.
process.env.ADMIN_TOKEN = 'test-admin-token';

// The crypto bypass must never be active during tests — see research R2 and the
// guard assertion in test/integration/security-guard.test.ts.
delete process.env.LOAD_TEST_MODE;

// Mock Socket.IO to prevent actual network ports from opening during tests
vi.mock('socket.io', () => {
  return {
    Server: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      emit: vi.fn(),
      use: vi.fn(),
      close: vi.fn(),
      sockets: {
        emit: vi.fn(),
      },
    })),
  };
});

/* Silence application logging during tests.
 *
 * Not cosmetic. vitest intercepts stdout per test, and a suite that writes
 * hundreds of log lines from parallel workers contends on that single shared
 * stream — enough to push an unrelated file's beforeEach past its timeout.
 * That was observed: adding a test file that logs on every ceiling change made
 * the crypto integration suite, which is untouched by it, fail intermittently
 * with a 10s hook timeout while taking 20x its solo runtime.
 *
 * Set LOG_LEVEL to see them when debugging a specific test. */
if (!process.env.LOG_LEVEL) {
  logger.silent = true;
}

// Mock the Piston sandbox so no test reaches a real code-execution server.
// The real enums are preserved: services compare against StatusCode/CompareMode
// values, so replacing them with stubs would change behaviour rather than
// isolate it. Individual tests may still override this per-file.
vi.mock('piston-judger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('piston-judger')>();
  return {
    ...actual,
    piston: vi.fn(),
    pistonJudger: vi.fn(() => ({
      execute: vi.fn(),
      judge: vi.fn(),
    })),
  };
});

beforeAll(async () => {
  // Ensure the DB is initialized correctly for tests
  const { initDatabase } = await import('../src/config/database.config');
  await initDatabase();
});

beforeEach(async () => {
  const { JudgeQueueService } = await import('../src/services/judge-queue.service');
  const { DeployTestService } = await import('../src/services/deploy-test.service');
  const { RehearsalService } = await import('../src/services/rehearsal.service');
  const { JudgingWorkCoordinator } = await import('../src/services/judging-work-coordinator');
  await Promise.all([JudgeQueueService.settle(), DeployTestService.settle(), RehearsalService.settle()]);
  JudgeQueueService.reset();
  DeployTestService.reset();
  RehearsalService.reset();
  JudgingWorkCoordinator.reset();

  // Clear tables between tests to ensure isolation
  const { sequelize } = await import('../src/config/database.config');
  await sequelize.sync({ force: true });

  // Re-insert default config since force:true drops everything
  const { SystemSettings } = await import('../src/models/system-settings.model');
  const { DEFAULT_EXAM_CONFIG } = await import('../src/constants/default-config.constant');
  await SystemSettings.create({
    name: 'exam_config',
    value: JSON.stringify(DEFAULT_EXAM_CONFIG)
  });
});

afterAll(async () => {
  const { sequelize } = await import('../src/config/database.config');
  await sequelize.close();
  // Note: Since piston-judger is mocked in tests, no orphaned sandbox processes are created.
});
