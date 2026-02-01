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

	describe('boundary transitions (Slice 6)', () => {
		it('should migrate task from Sunday to next weekly note', async () => {
			const result = await testMigrateTaskPlugin({
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
			const result = await testMigrateTaskPlugin({
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

	describe('multi-select migration (Slice 6)', () => {
		it('should migrate multiple top-level tasks when selected', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task A
- [ ] Task B
- [ ] Task C
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			// Source should have all selected tasks marked as migrated
			expect(result.source).toContain('- [>] Task A');
			expect(result.source).toContain('- [>] Task B');
			expect(result.source).toContain('- [>] Task C');

			// Target should have all tasks
			expect(result.target).toContain('- [ ] Task A');
			expect(result.target).toContain('- [ ] Task B');
			expect(result.target).toContain('- [ ] Task C');
		});

		it('should only migrate top-level tasks, not children', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task A
  - [ ] Child of A
- [ ] Task B
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			// Source: Task A and B migrated, child removed with parent
			expect(result.source).toContain('- [>] Task A');
			expect(result.source).toContain('- [>] Task B');
			expect(result.source).not.toContain('Child of A');

			// Target: Both tasks with their children
			expect(result.target).toContain('- [ ] Task A');
			expect(result.target).toContain('Child of A');
			expect(result.target).toContain('- [ ] Task B');
		});

		it('should skip non-task lines in selection', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task A
- Just a note
- [x] Completed task
- [ ] Task B
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				selectionStartLine: 0,
				selectionEndLine: 3
			});

			// Only incomplete tasks should be migrated
			expect(result.source).toContain('- [>] Task A');
			expect(result.source).toContain('- Just a note'); // unchanged
			expect(result.source).toContain('- [x] Completed task'); // unchanged
			expect(result.source).toContain('- [>] Task B');

			// Target should only have incomplete tasks
			expect(result.target).toContain('- [ ] Task A');
			expect(result.target).toContain('- [ ] Task B');
			expect(result.target).not.toContain('Just a note');
			expect(result.target).not.toContain('Completed task');
		});

		it('should handle partial line selection', async () => {
			// Even if selection starts/ends mid-line, include those lines
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task A
- [ ] Task B
- [ ] Task C
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				selectionStartLine: 0,
				selectionEndLine: 1 // Only lines 0 and 1
			});

			// Tasks A and B should be migrated
			expect(result.source).toContain('- [>] Task A');
			expect(result.source).toContain('- [>] Task B');
			expect(result.source).toContain('- [ ] Task C'); // not selected

			expect(result.target).toContain('- [ ] Task A');
			expect(result.target).toContain('- [ ] Task B');
			expect(result.target).not.toContain('Task C');
		});

		it('should preserve original order of tasks in target', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] First task
- [ ] Second task
- [ ] Third task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			// Tasks should appear in original order (First, Second, Third)
			const firstIdx = result.target!.indexOf('First task');
			const secondIdx = result.target!.indexOf('Second task');
			const thirdIdx = result.target!.indexOf('Third task');

			expect(firstIdx).toBeGreaterThan(-1);
			expect(secondIdx).toBeGreaterThan(firstIdx);
			expect(thirdIdx).toBeGreaterThan(secondIdx);
		});

		it('should preserve original order with children in target', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] First task
  - First child
- [ ] Second task
  - Second child
- [ ] Third task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				selectionStartLine: 0,
				selectionEndLine: 4
			});

			// Tasks and children should appear in original order
			const firstIdx = result.target!.indexOf('First task');
			const firstChildIdx = result.target!.indexOf('First child');
			const secondIdx = result.target!.indexOf('Second task');
			const secondChildIdx = result.target!.indexOf('Second child');
			const thirdIdx = result.target!.indexOf('Third task');

			expect(firstIdx).toBeGreaterThan(-1);
			expect(firstChildIdx).toBeGreaterThan(firstIdx);
			expect(secondIdx).toBeGreaterThan(firstChildIdx);
			expect(secondChildIdx).toBeGreaterThan(secondIdx);
			expect(thirdIdx).toBeGreaterThan(secondChildIdx);
		});

		it('should fall back to single task when no selection', async () => {
			// No selectionStartLine/selectionEndLine = use cursorLine behavior
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task A
- [ ] Task B
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				cursorLine: 0
				// no selection params
			});

			// Only Task A should be migrated
			expect(result.source).toContain('- [>] Task A');
			expect(result.source).toContain('- [ ] Task B'); // unchanged

			expect(result.target).toContain('- [ ] Task A');
			expect(result.target).not.toContain('Task B');
		});
	});
});
