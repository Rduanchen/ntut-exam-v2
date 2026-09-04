import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/**
 * The frontend's first test configuration.
 *
 * Merged with the app's Vite config rather than declared separately, so the
 * tests resolve modules and compile single-file components exactly as the
 * application does. A test setup that diverges from the build is a test setup
 * that can pass on code the build rejects.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'happy-dom',
      globals: true,
      include: ['test/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json-summary'],
        include: [
          'src/api/deploy-test.ts',
          'src/stores/deploy-test.store.ts',
          'src/utils/download-json.ts',
        ],
        thresholds: { lines: 100 },
      },
      /* Vuetify ships components that import .css directly. Node cannot load
       * those, so the package must be processed by Vite rather than resolved
       * externally. */
      server: { deps: { inline: ['vuetify'] } },
    },
  }),
);
