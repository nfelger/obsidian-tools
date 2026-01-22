import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testMigrateTask } from '../helpers/migrateTaskTestHelper.js';

describe('migrateTask integration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('validation', () => {
    it('should do nothing if cursor is not on incomplete task', async () => {
      const result = await testMigrateTask({
        source: `
- [x] Completed task
- Just a note
- [ ] Incomplete task
`,
        sourceFileName: '2026-01-22 Thu',
        targetContent: '',
        cursorLine: 0 // On completed task
      });

      // Source should be unchanged
      expect(result.source).toContain('- [x] Completed task');
      expect(result.notice).toMatch(/not.*incomplete task|no incomplete task/i);
    });

    it('should do nothing for plain bullet points', async () => {
      const result = await testMigrateTask({
        source: `
- Just a note
- [ ] Incomplete task
`,
        sourceFileName: '2026-01-22 Thu',
        targetContent: '',
        cursorLine: 0
      });

      expect(result.source).toContain('- Just a note');
      expect(result.notice).toMatch(/not.*incomplete task|no incomplete task/i);
    });

    it('should fail if not in a periodic note', async () => {
      const result = await testMigrateTask({
        source: `
- [ ] Some task
`,
        sourceFileName: 'Migration Initiative',
        targetContent: '',
        cursorLine: 0
      });

      expect(result.notice).toMatch(/not.*periodic|periodic note/i);
    });

    it('should fail if target note does not exist', async () => {
      const result = await testMigrateTask({
        source: `
- [ ] Task to migrate
`,
        sourceFileName: '2026-01-22 Thu',
        targetContent: null, // Target doesn't exist
        cursorLine: 0
      });

      expect(result.notice).toMatch(/not exist|doesn't exist|does not exist/i);
    });
  });

  describe('single line migration', () => {
    it('should migrate a single task to next daily note', async () => {
      const result = await testMigrateTask({
        source: `
- [ ] Task to migrate
- [ ] Another task
`,
        sourceFileName: '2026-01-22 Thu',
        targetContent: '',
        cursorLine: 0
      });

      // Source should have migrated marker
      expect(result.source).toContain('- [>] Task to migrate');
      // Target should have the task
      expect(result.target).toContain('## Migrated');
      expect(result.target).toContain('- [ ] Task to migrate');
    });

    it('should migrate task from Sunday to next weekly note', async () => {
      const result = await testMigrateTask({
        source: `
- [ ] Sunday task
`,
        sourceFileName: '2026-01-18 Sun', // Sunday
        targetContent: '',
        cursorLine: 0
      });

      // Should target next weekly note
      expect(result.targetPath).toMatch(/W04/);
      expect(result.source).toContain('- [>] Sunday task');
      expect(result.target).toContain('- [ ] Sunday task');
    });

    it('should migrate task from December monthly to next yearly note', async () => {
      const result = await testMigrateTask({
        source: `
- [ ] December task
`,
        sourceFileName: '2026-12 Dec',
        targetContent: '',
        cursorLine: 0
      });

      // Should target next yearly note
      expect(result.targetPath).toContain('2027/2027');
      expect(result.source).toContain('- [>] December task');
      expect(result.target).toContain('- [ ] December task');
    });
  });

  describe('migration with children', () => {
    it('should migrate task with nested children', async () => {
      const result = await testMigrateTask({
        source: `
- [ ] Parent task
  - Child 1
  - [ ] Child task
    - Grandchild
- [ ] Next task
`,
        sourceFileName: '2026-01-22 Thu',
        targetContent: '',
        cursorLine: 0
      });

      // Source should have only the parent with migrated marker
      expect(result.source).toContain('- [>] Parent task');
      expect(result.source).not.toContain('Child 1');
      expect(result.source).toContain('- [ ] Next task');

      // Target should have parent and all children
      expect(result.target).toContain('- [ ] Parent task');
      expect(result.target).toContain('Child 1');
      expect(result.target).toContain('Child task');
      expect(result.target).toContain('Grandchild');
    });

    it('should preserve indentation of children in target', async () => {
      const result = await testMigrateTask({
        source: `
- [ ] Task
  - Level 1
    - Level 2
`,
        sourceFileName: '2026-01-22 Thu',
        targetContent: '',
        cursorLine: 0
      });

      // Target should preserve relative indentation
      expect(result.target).toMatch(/- \[ \] Task\n\s+- Level 1\n\s+- Level 2/);
    });
  });

  describe('Migrated heading management', () => {
    it('should create ## Migrated heading if not present', async () => {
      const result = await testMigrateTask({
        source: `
- [ ] Task
`,
        sourceFileName: '2026-01-22 Thu',
        targetContent: `
# Daily Note

Some content
`,
        cursorLine: 0
      });

      expect(result.target).toContain('## Migrated');
      expect(result.target).toContain('- [ ] Task');
    });

    it('should add task under existing ## Migrated heading', async () => {
      const result = await testMigrateTask({
        source: `
- [ ] New task
`,
        sourceFileName: '2026-01-22 Thu',
        targetContent: `
## Migrated
- [ ] Existing task
`,
        cursorLine: 0
      });

      expect(result.target).toContain('## Migrated');
      expect(result.target).toContain('- [ ] Existing task');
      expect(result.target).toContain('- [ ] New task');
    });

    it('should place ## Migrated after frontmatter', async () => {
      const result = await testMigrateTask({
        source: `
- [ ] Task
`,
        sourceFileName: '2026-01-22 Thu',
        targetContent: `---
title: Note
---

# Heading
`,
        cursorLine: 0
      });

      // Migrated should come after frontmatter
      const frontmatterEnd = result.target.indexOf('---', 3);
      const migratedPos = result.target.indexOf('## Migrated');
      expect(migratedPos).toBeGreaterThan(frontmatterEnd);
    });
  });
});
