import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, 'tests/mocks/obsidian.js')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['scripts/**/*.js', 'src/**/*.ts'],
      exclude: [
        'scripts/**/*.test.js',
        'scripts/**/*.spec.js',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'node_modules/**'
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75
      }
    }
  }
});
