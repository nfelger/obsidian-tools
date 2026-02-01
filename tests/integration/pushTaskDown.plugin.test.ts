import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testPushTaskDownPlugin } from '../helpers/pushTaskDownPluginTestHelper';

describe('pushTaskDown (plugin) - integration', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('validation', () => {
		it('should do nothing if cursor is not on incomplete task', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [x] Completed task
- Just a note
- [ ] Incomplete task
`,
				sourceFileName: '2026-01-W04',
				targetContent: '',
				today: new Date(2026, 0, 22), // Thu Jan 22
				cursorLine: 0 // On completed task
			});

			// Source should be unchanged
			expect(result.source).toContain('- [x] Completed task');
			expect(result.notice).toMatch(/not.*incomplete task|no incomplete task/i);
		});

		it('should fail if not in a periodic note', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] Some task
`,
				sourceFileName: 'Migration Initiative',
				targetContent: '',
				today: new Date(2026, 0, 22),
				cursorLine: 0
			});

			expect(result.notice).toMatch(/not.*periodic|periodic note/i);
		});

		it('should fail if target note does not exist', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] Task to push
`,
				sourceFileName: '2026-01-W04',
				targetContent: null, // Target doesn't exist
				today: new Date(2026, 0, 22),
				cursorLine: 0
			});

			expect(result.notice).toMatch(/not exist|doesn't exist|does not exist/i);
		});

		it('should fail if already at daily level', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] Task on daily note
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				today: new Date(2026, 0, 22),
				cursorLine: 0
			});

			expect(result.notice).toMatch(/lowest|daily|cannot push/i);
		});

		it('should fail if today is not in source period', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] Task from past week
`,
				sourceFileName: '2026-01-W03', // Week 3
				targetContent: '',
				today: new Date(2026, 0, 22), // Thu Jan 22 = Week 4
				cursorLine: 0
			});

			expect(result.notice).toMatch(/current|not in|period/i);
		});
	});

	describe('weekly to daily', () => {
		it('should push task from weekly note to current daily', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] Task to push down
- [ ] Another task
`,
				sourceFileName: '2026-01-W04',
				targetContent: '',
				today: new Date(2026, 0, 22), // Thu Jan 22
				cursorLine: 0
			});

			// Source should have scheduled marker
			expect(result.source).toContain('- [<] Task to push down');
			// Next task should be unchanged
			expect(result.source).toContain('- [ ] Another task');
			// Target should have the task
			expect(result.target).toContain('## Log');
			expect(result.target).toContain('- [ ] Task to push down');
			// Target path should be daily note
			expect(result.targetPath).toContain('2026-01-22');
		});

		it('should push started task [/] as open task', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [/] Started task
`,
				sourceFileName: '2026-01-W04',
				targetContent: '',
				today: new Date(2026, 0, 22),
				cursorLine: 0
			});

			expect(result.source).toContain('- [<] Started task');
			expect(result.target).toContain('- [ ] Started task');
		});

		it('should push task with nested children', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] Parent task
  - Child 1
  - [ ] Child task
    - Grandchild
- [ ] Next task
`,
				sourceFileName: '2026-01-W04',
				targetContent: '',
				today: new Date(2026, 0, 22),
				cursorLine: 0
			});

			// Source should have only the parent with scheduled marker
			expect(result.source).toContain('- [<] Parent task');
			expect(result.source).not.toContain('Child 1');
			expect(result.source).toContain('- [ ] Next task');

			// Target should have parent and all children
			expect(result.target).toContain('- [ ] Parent task');
			expect(result.target).toContain('Child 1');
			expect(result.target).toContain('Child task');
			expect(result.target).toContain('Grandchild');
		});
	});

	describe('monthly to weekly', () => {
		it('should push task from monthly note to current weekly', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] Monthly goal
`,
				sourceFileName: '2026-01 Jan',
				targetContent: '',
				today: new Date(2026, 0, 22), // Thu Jan 22 = W04
				cursorLine: 0
			});

			expect(result.source).toContain('- [<] Monthly goal');
			expect(result.target).toContain('- [ ] Monthly goal');
			expect(result.targetPath).toContain('W04');
		});
	});

	describe('yearly to monthly', () => {
		it('should push task from yearly note to current monthly', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] Yearly goal
`,
				sourceFileName: '2026',
				targetContent: '',
				today: new Date(2026, 0, 22), // January 2026
				cursorLine: 0
			});

			expect(result.source).toContain('- [<] Yearly goal');
			expect(result.target).toContain('- [ ] Yearly goal');
			expect(result.targetPath).toContain('2026-01');
		});

		it('should push to December when today is in December', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] End of year task
`,
				sourceFileName: '2026',
				targetContent: '',
				today: new Date(2026, 11, 15), // December 15, 2026
				cursorLine: 0
			});

			expect(result.source).toContain('- [<] End of year task');
			expect(result.targetPath).toContain('2026-12');
		});
	});

	describe('Log heading management', () => {
		it('should create ## Log heading if not present', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] Task
`,
				sourceFileName: '2026-01-W04',
				targetContent: `
# Daily Note

Some content
`,
				today: new Date(2026, 0, 22),
				cursorLine: 0
			});

			expect(result.target).toContain('## Log');
			expect(result.target).toContain('- [ ] Task');
		});

		it('should add task under existing ## Log heading', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] New task
`,
				sourceFileName: '2026-01-W04',
				targetContent: `
## Log
- [ ] Existing task
`,
				today: new Date(2026, 0, 22),
				cursorLine: 0
			});

			expect(result.target).toContain('## Log');
			expect(result.target).toContain('- [ ] Existing task');
			expect(result.target).toContain('- [ ] New task');
		});
	});

	describe('multi-select', () => {
		it('should push multiple top-level tasks when selected', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] Task A
- [ ] Task B
- [ ] Task C
`,
				sourceFileName: '2026-01-W04',
				targetContent: '',
				today: new Date(2026, 0, 22),
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			// Source should have all selected tasks marked as scheduled
			expect(result.source).toContain('- [<] Task A');
			expect(result.source).toContain('- [<] Task B');
			expect(result.source).toContain('- [<] Task C');

			// Target should have all tasks
			expect(result.target).toContain('- [ ] Task A');
			expect(result.target).toContain('- [ ] Task B');
			expect(result.target).toContain('- [ ] Task C');
		});

		it('should only push top-level tasks, not children', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] Task A
  - [ ] Child of A
- [ ] Task B
`,
				sourceFileName: '2026-01-W04',
				targetContent: '',
				today: new Date(2026, 0, 22),
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			// Source: Task A and B scheduled, child removed with parent
			expect(result.source).toContain('- [<] Task A');
			expect(result.source).toContain('- [<] Task B');
			expect(result.source).not.toContain('Child of A');

			// Target: Both tasks with their children
			expect(result.target).toContain('- [ ] Task A');
			expect(result.target).toContain('Child of A');
			expect(result.target).toContain('- [ ] Task B');
		});

		it('should preserve original order of tasks in target', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] First task
- [ ] Second task
- [ ] Third task
`,
				sourceFileName: '2026-01-W04',
				targetContent: '',
				today: new Date(2026, 0, 22),
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			const firstIdx = result.target!.indexOf('First task');
			const secondIdx = result.target!.indexOf('Second task');
			const thirdIdx = result.target!.indexOf('Third task');

			expect(firstIdx).toBeGreaterThan(-1);
			expect(secondIdx).toBeGreaterThan(firstIdx);
			expect(thirdIdx).toBeGreaterThan(secondIdx);
		});
	});

	describe('deduplication', () => {
		it('should merge children when task already exists as incomplete', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] Review PR
  - Check tests
`,
				sourceFileName: '2026-01-W04',
				targetContent: `
## Log
- [ ] Review PR
  - Existing note
`,
				today: new Date(2026, 0, 22),
				cursorLine: 0
			});

			// Source marked as scheduled
			expect(result.source).toContain('- [<] Review PR');

			// Target: task NOT duplicated, children merged
			const taskMatches = result.target!.match(/Review PR/g);
			expect(taskMatches).toHaveLength(1);
			expect(result.target).toContain('- Existing note');
			expect(result.target).toContain('- Check tests');
		});

		it('should reopen scheduled task and merge children', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] Urgent task
  - New subtask
`,
				sourceFileName: '2026-01-W04',
				targetContent: `
## Log
- [<] Urgent task
  - Old subtask
`,
				today: new Date(2026, 0, 22),
				cursorLine: 0
			});

			// Target: scheduled task reopened as [ ]
			expect(result.target).toContain('- [ ] Urgent task');
			expect(result.target).not.toContain('- [<] Urgent task');

			// Children merged
			expect(result.target).toContain('- Old subtask');
			expect(result.target).toContain('- New subtask');
		});

		it('should insert as new when no duplicate found', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] New task
`,
				sourceFileName: '2026-01-W04',
				targetContent: `
## Log
- [ ] Different task
`,
				today: new Date(2026, 0, 22),
				cursorLine: 0
			});

			// Both tasks present
			expect(result.target).toContain('- [ ] New task');
			expect(result.target).toContain('- [ ] Different task');
		});

		it('should not match completed tasks for deduplication', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] Same name task
  - New child
`,
				sourceFileName: '2026-01-W04',
				targetContent: `
## Log
- [x] Same name task
  - Old child
`,
				today: new Date(2026, 0, 22),
				cursorLine: 0
			});

			// Should insert as new since the existing one is completed
			expect(result.target).toContain('- [x] Same name task');
			expect(result.target).toContain('- [ ] Same name task');
		});

		it('should handle mix of duplicates and new tasks in multi-select', async () => {
			const result = await testPushTaskDownPlugin({
				source: `
- [ ] Existing task
  - New child
- [ ] New task
`,
				sourceFileName: '2026-01-W04',
				targetContent: `
## Log
- [ ] Existing task
  - Old child
`,
				today: new Date(2026, 0, 22),
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			// Source tasks marked as scheduled
			expect(result.source).toContain('- [<] Existing task');
			expect(result.source).toContain('- [<] New task');

			// Existing task merged (not duplicated)
			const existingMatches = result.target!.match(/Existing task/g);
			expect(existingMatches).toHaveLength(1);

			// Children merged
			expect(result.target).toContain('- Old child');
			expect(result.target).toContain('- New child');

			// New task added
			expect(result.target).toContain('- [ ] New task');
		});
	});
});
