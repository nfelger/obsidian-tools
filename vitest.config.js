import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, 'tests/mocks/obsidian.js'),
      'obsidian-daily-notes-interface': path.resolve(__dirname, 'tests/mocks/dailyNotesInterface.js')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    // Stryker copies the project into a sandbox to mutate it. Without this,
    // a plain `npm test` during a mutation run collects those copies too and
    // reports several times the real number of tests.
    exclude: ['**/node_modules/**', '**/dist/**', '.stryker-tmp/**', 'reports/**'],
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
      // Ratcheted to sit just under actual coverage, so a regression fails the
      // run instead of being absorbed by slack. Raise these when coverage rises.
      thresholds: {
        lines: 88,
        functions: 93,
        branches: 85,
        statements: 88
      }
    }
  }
});
