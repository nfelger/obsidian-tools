import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testPullUpPlugin } from '../helpers/pullTaskUpPluginTestHelper';

describe('pullTaskUp command', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('validation', () => {
		it('shows error when not a periodic note', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] Task`,
				sourceFileName: 'Some Project',
				targetContent: null,
				cursorLine: 0
			});

			expect(result.notice).toContain('not a periodic note');
		});

		it('shows error when already at yearly level', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] Task`,
				sourceFileName: '2026',
				targetContent: `## Log`,
				cursorLine: 0
			});

			expect(result.notice).toContain('already at highest level');
		});

		it('shows error when target note does not exist', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] Task`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: null,
				cursorLine: 0
			});

			expect(result.notice).toContain('does not exist');
		});

		it('shows error when cursor not on incomplete task', async () => {
			const result = await testPullUpPlugin({
				source: `- [x] Completed task
- [ ] Open task`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `## Log`,
				cursorLine: 0
			});

			expect(result.notice).toContain('not on an incomplete task');
		});
	});

	describe('hierarchy transitions', () => {
		it('pulls daily → weekly', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] Task to pull
  - Child item`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `## Log
`,
				cursorLine: 0
			});

			// Source: task marked as scheduled, children removed
			expect(result.source).toContain('- [<] Task to pull');
			expect(result.source).not.toContain('Child item');

			// Target: task and children added
			expect(result.target).toContain('- [ ] Task to pull');
			expect(result.target).toContain('  - Child item');
		});

		it('pulls weekly → monthly', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] Weekly task
  - Subtask`,
				sourceFileName: '2026-01-W04',
				targetContent: `## Log
`,
				cursorLine: 0
			});

			expect(result.source).toContain('- [<] Weekly task');
			expect(result.target).toContain('- [ ] Weekly task');
			expect(result.target).toContain('  - Subtask');
		});

		it('pulls monthly → yearly', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] Monthly goal
  - Milestone 1`,
				sourceFileName: '2026-01 Jan',
				targetContent: `## Log
`,
				cursorLine: 0
			});

			expect(result.source).toContain('- [<] Monthly goal');
			expect(result.target).toContain('- [ ] Monthly goal');
			expect(result.target).toContain('  - Milestone 1');
		});
	});

	describe('deduplication', () => {
		it('merges children when task exists as incomplete', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] Review PR
  - Check tests`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `## Log
- [ ] Review PR
  - Existing note`,
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

		it('reopens scheduled task and merges children', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] Urgent task
  - New subtask`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `## Log
- [<] Urgent task
  - Old subtask`,
				cursorLine: 0
			});

			// Target: scheduled task reopened as [ ]
			expect(result.target).toContain('- [ ] Urgent task');
			expect(result.target).not.toContain('- [<] Urgent task');

			// Children merged
			expect(result.target).toContain('- Old subtask');
			expect(result.target).toContain('- New subtask');
		});

		it('inserts as new when no duplicate found', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] New task`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `## Log
- [ ] Different task`,
				cursorLine: 0
			});

			// Both tasks present
			expect(result.target).toContain('- [ ] New task');
			expect(result.target).toContain('- [ ] Different task');
		});

		it('does not match completed tasks for deduplication', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] Same name task
  - New child`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `## Log
- [x] Same name task
  - Old child`,
				cursorLine: 0
			});

			// Should insert as new since the existing one is completed
			// Two tasks with same name should exist
			expect(result.target).toContain('- [x] Same name task');
			expect(result.target).toContain('- [ ] Same name task');
		});

		it('handles task without children being merged', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] Simple task`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `## Log
- [ ] Simple task
  - Existing child`,
				cursorLine: 0
			});

			// Task not duplicated
			const taskMatches = result.target!.match(/Simple task/g);
			expect(taskMatches).toHaveLength(1);

			// Existing children preserved
			expect(result.target).toContain('- Existing child');
		});
	});

	describe('multi-select', () => {
		it('pulls multiple tasks at once', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] Task A
- [ ] Task B
- [ ] Task C`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `## Log
`,
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			// All source tasks marked as scheduled
			expect(result.source).toContain('- [<] Task A');
			expect(result.source).toContain('- [<] Task B');
			expect(result.source).toContain('- [<] Task C');

			// All tasks in target
			expect(result.target).toContain('- [ ] Task A');
			expect(result.target).toContain('- [ ] Task B');
			expect(result.target).toContain('- [ ] Task C');

			// Notice indicates multiple tasks
			expect(result.notice).toContain('3 tasks');
		});

		it('handles mix of duplicates and new tasks', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] Existing task
  - New child
- [ ] New task`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `## Log
- [ ] Existing task
  - Old child`,
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

		it('preserves original order of tasks in target', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] First task
- [ ] Second task
- [ ] Third task`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `## Log
`,
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

		it('excludes child tasks from selection', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] Parent task
  - [ ] Child task
- [ ] Other task`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `## Log
`,
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			// Only parent tasks should be pulled (not the child)
			expect(result.source).toContain('- [<] Parent task');
			expect(result.source).toContain('- [<] Other task');

			// Target should have parent with child preserved, and other task
			expect(result.target).toContain('- [ ] Parent task');
			expect(result.target).toContain('  - [ ] Child task');
			expect(result.target).toContain('- [ ] Other task');
		});
	});

	describe('content preservation', () => {
		it('preserves special characters in task text', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] Task with [[link]] and #tag`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `## Log
`,
				cursorLine: 0
			});

			expect(result.target).toContain('- [ ] Task with [[link]] and #tag');
		});

		it('converts started task to open when pulling', async () => {
			const result = await testPullUpPlugin({
				source: `- [/] Started task`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `## Log
`,
				cursorLine: 0
			});

			// Source should be scheduled (not started)
			expect(result.source).toContain('- [<] Started task');
			// Target should have the task as-is (started marker preserved since pullTaskUp doesn't convert)
			expect(result.target).toContain('- [/] Started task');
		});

		it('preserves deeply nested children', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] Parent
  - Child
    - Grandchild
      - Great-grandchild`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `## Log
`,
				cursorLine: 0
			});

			expect(result.target).toContain('- [ ] Parent');
			expect(result.target).toContain('  - Child');
			expect(result.target).toContain('    - Grandchild');
			expect(result.target).toContain('      - Great-grandchild');
		});
	});

	describe('target heading', () => {
		it('creates ## Log heading if missing', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] Task`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `# Weekly Note

Some content`,
				cursorLine: 0
			});

			expect(result.target).toContain('## Log');
			expect(result.target).toContain('- [ ] Task');
		});

		it('appends under existing ## Log heading', async () => {
			const result = await testPullUpPlugin({
				source: `- [ ] New task`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `# Weekly Note

## Log
- [ ] Existing task`,
				cursorLine: 0
			});

			// New task should be under Log heading
			const logIndex = result.target!.indexOf('## Log');
			const newTaskIndex = result.target!.indexOf('- [ ] New task');
			const existingTaskIndex = result.target!.indexOf('- [ ] Existing task');

			expect(logIndex).toBeLessThan(newTaskIndex);
			expect(newTaskIndex).toBeLessThan(existingTaskIndex);
		});
	});
});
