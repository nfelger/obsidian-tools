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

	describe('never groups in the daily note', () => {
		it('does not insert under an existing "Push [[Project]]" collector', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Define rollback strategy
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: `
- [ ] Push [[Migration Initiative]]
	- [ ] Some other task
- [ ] Unrelated
`,
				today,
				cursorLine: 0
			});

			// Task arrives as a top-level prefixed task, not nested under the collector
			expect(result.daily).toContain('- [ ] [[Migration Initiative]] Define rollback strategy');
			const lines = result.daily!.split('\n');
			expect(lines).not.toContain('\t- [ ] Define rollback strategy');
			// The collector and its existing child are untouched
			expect(result.daily).toContain('- [ ] Push [[Migration Initiative]]');
			expect(result.daily).toContain('\t- [ ] Some other task');
		});

		it('does not insert under a "Finish [[Project]]" collector either', async () => {
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

			expect(result.daily).toContain('- [ ] Finish [[Migration Initiative]]');
			expect(result.daily).toContain('- [ ] [[Migration Initiative]] Final review');
			const lines = result.daily!.split('\n');
			expect(lines).not.toContain('\t- [ ] Final review');
		});

		it('does not match partial keyword prefix as a collector', async () => {
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

			expect(result.daily).toContain('## Log');
			expect(result.daily).toContain('[[Migration Initiative]] Some task');
		});
	});

	describe('multi-select', () => {
		it('takes all tasks as individual prefixed appends, never grouped', async () => {
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

			// Daily: no collector, each task individually prefixed
			expect(result.daily).not.toContain('Push [[Migration Initiative]]');
			expect(result.daily).toContain('- [ ] [[Migration Initiative]] First task');
			expect(result.daily).toContain('- [ ] [[Migration Initiative]] Second task');
			expect(result.daily).toContain('- [ ] [[Migration Initiative]] Third task');
		});

		it('preserves original order across multiple prefixed appends', async () => {
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

			const firstIdx = result.daily!.indexOf('First task');
			const secondIdx = result.daily!.indexOf('Second task');
			const thirdIdx = result.daily!.indexOf('Third task');

			expect(firstIdx).toBeGreaterThan(-1);
			expect(secondIdx).toBeGreaterThan(firstIdx);
			expect(thirdIdx).toBeGreaterThan(secondIdx);
		});

		it('keeps single-task takes under the heading with project link (no collector)', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Lone task
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: '',
				today,
				cursorLine: 0
			});

			expect(result.daily).toContain('- [ ] [[Migration Initiative]] Lone task');
			expect(result.daily).not.toContain('Push [[Migration Initiative]]');
		});

		it('does not group under an existing collector even with multiple tasks selected', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] First task
- [ ] Second task
- [ ] Third task
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: `
- [ ] Push [[Migration Initiative]]
- [ ] Some other task
`,
				today,
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			const lines = result.daily!.split('\n');
			expect(lines).not.toContain('\t- [ ] First task');
			expect(result.daily).toContain('- [ ] [[Migration Initiative]] First task');
			expect(result.daily).toContain('- [ ] [[Migration Initiative]] Second task');
			expect(result.daily).toContain('- [ ] [[Migration Initiative]] Third task');
		});
	});

	describe('dedup', () => {
		it('reopens a scheduled prefixed copy and merges children instead of duplicating', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Draft plan
  - new note
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: `
## Todo
- [<] [[Migration Initiative]] Draft plan
`,
				today,
				cursorLine: 0
			});

			expect(result.daily!.match(/Draft plan/g)).toHaveLength(1);
			expect(result.daily).toContain('- [ ] [[Migration Initiative]] Draft plan');
			expect(result.daily).toContain('- new note');
		});

		it('merges into a copy under a manually created collector', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Draft plan
  - new note
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: `
## Todo
- [ ] Push [[Migration Initiative]]
	- [ ] Draft plan
`,
				today,
				cursorLine: 0
			});

			expect(result.daily!.match(/Draft plan/g)).toHaveLength(1);
			expect(result.daily).toContain('- new note');
		});

		it('matches an aliased daily copy', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Draft plan
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: `
## Todo
- [<] [[Migration Initiative|MI]] Draft plan
`,
				today,
				cursorLine: 0
			});

			expect(result.daily!.match(/Draft plan/g)).toHaveLength(1);
			expect(result.daily).toContain('- [ ] [[Migration Initiative|MI]] Draft plan');
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

		it('creates the daily note when it does not exist', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Some task
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: null,
				today,
				cursorLine: 0
			});

			expect(result.source).toContain('- [<] Some task');
			expect(result.daily).toContain('[[Migration Initiative]] Some task');
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

	describe('transactional safety', () => {
		it('leaves the project note untouched when the daily write fails', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Define rollback strategy
  - Child note
`,
				sourceFileName: 'Migration Initiative',
				dailyNoteContent: '',
				today: new Date(2026, 0, 30),
				cursorLine: 0,
				failTargetWrite: true
			});

			expect(result.source).toContain('- [ ] Define rollback strategy');
			expect(result.source).toContain('- Child note');
			expect(result.source).not.toContain('[<]');
			expect(result.notice).toMatch(/error/i);
		});
	});

});
