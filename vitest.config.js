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
      // Re-baselined for vitest 4, which counts every file matching `include` —
      // main.ts and settings.ts (plugin wiring, exercised only in e2e) now sit
      // at 0% in the denominator, which is why functions dropped from the old 93.
      thresholds: {
        lines: 90,
        functions: 81,
        branches: 86,
        statements: 88
      }
    }
  }
});
