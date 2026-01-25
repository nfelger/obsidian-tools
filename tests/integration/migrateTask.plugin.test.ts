import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testMigrateTaskPlugin } from '../helpers/migrateTaskPluginTestHelper';

describe('migrateTask (plugin) - MVP integration', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('validation', () => {
		it('should do nothing if cursor is not on incomplete task', async () => {
			const result = await testMigrateTaskPlugin({
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
			const result = await testMigrateTaskPlugin({
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
			const result = await testMigrateTaskPlugin({
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
			const result = await testMigrateTaskPlugin({
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

	describe('single line migration - daily notes only (MVP)', () => {
		it('should migrate a single task to next daily note', async () => {
			const result = await testMigrateTaskPlugin({
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
			expect(result.target).toContain('## Log');
			expect(result.target).toContain('- [ ] Task to migrate');
			// Next task should be unchanged
			expect(result.source).toContain('- [ ] Another task');
		});

		it('should migrate started task [/] as incomplete', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [/] Started task
- [ ] Regular task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				cursorLine: 0
			});

			// Source should have migrated marker
			expect(result.source).toContain('- [>] Started task');
			// Target should have open task (reset to unchecked)
			expect(result.target).toContain('- [ ] Started task');
		});
	});

	describe('migration with children', () => {
		it('should migrate task with nested children', async () => {
			const result = await testMigrateTaskPlugin({
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
			const result = await testMigrateTaskPlugin({
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

	describe('Log heading management', () => {
		it('should create ## Log heading if not present', async () => {
			const result = await testMigrateTaskPlugin({
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

			expect(result.target).toContain('## Log');
			expect(result.target).toContain('- [ ] Task');
		});

		it('should add task under existing ## Log heading', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] New task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `
## Log
- [ ] Existing task
`,
				cursorLine: 0
			});

			expect(result.target).toContain('## Log');
			expect(result.target).toContain('- [ ] Existing task');
			expect(result.target).toContain('- [ ] New task');
		});

		it('should place ## Log after frontmatter', async () => {
			const result = await testMigrateTaskPlugin({
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

			// Log heading should come after frontmatter
			const frontmatterEnd = result.target!.indexOf('---', 3);
			const logPos = result.target!.indexOf('## Log');
			expect(logPos).toBeGreaterThan(frontmatterEnd);
		});
	});
});
