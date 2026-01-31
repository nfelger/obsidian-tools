import { describe, it, expect } from 'vitest';
import { testTakeProjectTaskPlugin } from '../helpers/takeProjectTaskPluginTestHelper';

describe('takeProjectTask', () => {
	const today = new Date(2026, 0, 30); // 2026-01-30 Fri

	describe('basic functionality', () => {
		it('takes a task from project to daily note under target heading', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
## Todo
- [ ] Define rollback strategy
- [ ] Get sign-off from security team
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: `
## Log
- Some existing content
`,
				today,
				cursorLine: 1
			});

			// Source: task marked as scheduled
			expect(result.source).toContain('- [<] Define rollback strategy');

			// Daily: task added under ## Log with project link prepended
			expect(result.daily).toContain('[[Migration Initiative]] Define rollback strategy');
		});

		it('prepends [[Project]] to the taken task', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Write monitoring runbook
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: '',
				today,
				cursorLine: 0
			});

			expect(result.daily).toContain('- [ ] [[Migration Initiative]] Write monitoring runbook');
		});

		it('takes task with children', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Define rollback strategy
  - Need to consider 3 failure modes
  - Check with ops team
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: '',
				today,
				cursorLine: 0
			});

			// Source: task scheduled, children removed
			expect(result.source).toContain('- [<] Define rollback strategy');
			expect(result.source).not.toContain('failure modes');

			// Daily: task and children present
			expect(result.daily).toContain('[[Migration Initiative]] Define rollback strategy');
			expect(result.daily).toContain('failure modes');
			expect(result.daily).toContain('ops team');
		});
	});

	describe('collector task matching', () => {
		it('inserts under collector when "Push [[Project]]" exists in daily', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Define rollback strategy
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: `
- [ ] Push [[Migration Initiative]]
- [ ] Some other task
`,
				today,
				cursorLine: 0
			});

			// Task should be nested under the collector
			const lines = result.daily!.split('\n');
			const collectorIdx = lines.findIndex(l => l.includes('Push [[Migration Initiative]]'));
			expect(collectorIdx).toBeGreaterThanOrEqual(0);

			// Next line should be the indented taken task
			const nextLine = lines[collectorIdx + 1];
			expect(nextLine).toContain('[[Migration Initiative]] Define rollback strategy');
			expect(nextLine).toMatch(/^\s{4}/); // indented 4 spaces
		});

		it('matches "Finish" keyword as collector', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Final review
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: `
- [ ] Finish [[Migration Initiative]]
`,
				today,
				cursorLine: 0
			});

			expect(result.daily).toContain('Finish [[Migration Initiative]]');
			expect(result.daily).toContain('[[Migration Initiative]] Final review');
		});

		it('does not match partial keyword prefix', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Some task
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: `
## Log
- [ ] Pushing [[Migration Initiative]]
`,
				today,
				cursorLine: 0
			});

			// Should NOT be nested under "Pushing" - falls back to heading
			expect(result.daily).toContain('## Log');
			expect(result.daily).toContain('[[Migration Initiative]] Some task');
		});
	});

	describe('multi-select', () => {
		it('takes multiple tasks from project', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] First task
- [ ] Second task
- [ ] Third task
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: '',
				today,
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			// All source tasks marked as scheduled
			expect(result.source).toContain('- [<] First task');
			expect(result.source).toContain('- [<] Second task');
			expect(result.source).toContain('- [<] Third task');

			// All tasks in daily
			expect(result.daily).toContain('[[Migration Initiative]] First task');
			expect(result.daily).toContain('[[Migration Initiative]] Second task');
			expect(result.daily).toContain('[[Migration Initiative]] Third task');
		});
	});

	describe('validation', () => {
		it('errors when not on a project note', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Some task
`,
				sourceFileName: 'Not A Project',
				sourcePath: '+Diary/2026/01/Not A Project.md',
				dailyNoteContent: '',
				today,
				cursorLine: 0
			});

			expect(result.notice).toContain('not a project note');
		});

		it('errors when daily note does not exist', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Some task
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: null,
				today,
				cursorLine: 0
			});

			expect(result.notice).toContain('does not exist');
		});

		it('errors when cursor is not on an incomplete task', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [x] Completed task
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: '',
				today,
				cursorLine: 0
			});

			expect(result.notice).toContain('not on an incomplete task');
		});
	});

	describe('started tasks', () => {
		it('converts started [/] task to open [ ] in daily note', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [/] In progress task
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: '',
				today,
				cursorLine: 0
			});

			// Source: marked as scheduled
			expect(result.source).toContain('- [<] In progress task');

			// Daily: converted to open
			expect(result.daily).toContain('- [ ] [[Migration Initiative]] In progress task');
		});
	});
});
