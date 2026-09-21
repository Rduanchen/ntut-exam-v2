import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
      include: [
        'src/config/deploy-test*.ts',
        'src/schemas/deploy-test.schema.ts',
        'src/types/deploy-test.type.ts',
        'src/utils/judger-output.util.ts',
        'src/services/deploy-test*.ts',
        'src/services/judge-execution.service.ts',
        'src/services/judging-work-coordinator.ts',
        'src/controllers/admin/admin-deploy-test.controller.ts',
        'src/config/rehearsal*.ts',
        'src/schemas/rehearsal.schema.ts',
        'src/types/rehearsal.type.ts',
        'src/services/rehearsal*.ts',
        'src/controllers/admin/admin-rehearsal.controller.ts',
      ],
      thresholds: { lines: 100 },
    }
  },
});
