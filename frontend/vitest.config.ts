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
      /* Vuetify ships components that import .css directly. Node cannot load
       * those, so the package must be processed by Vite rather than resolved
       * externally. */
      server: { deps: { inline: ['vuetify'] } },
    },
  }),
);
