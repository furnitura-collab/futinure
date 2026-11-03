import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.e2e.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup-env.ts'],
    // e2e testlar bitta bazani ishlatadi
    fileParallelism: false,
    testTimeout: 20_000,
  },
  // NestJS DI uchun decorator metadata kerak, esbuild buni bermaydi
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
