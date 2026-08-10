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
				targetNoteContent: `
## Log
- Some existing content
`,
				today,
				cursorLine: 1
			});

			// Source: task marked as scheduled
			expect(result.source).toContain('- [<] Define rollback strategy');

			// Daily: task added under ## Log with project link prepended
			expect(result.target).toContain('[[Migration Initiative]] Define rollback strategy');
		});

		it('prepends [[Project]] to the taken task', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Write monitoring runbook
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: '',
				today,
				cursorLine: 0
			});

			expect(result.target).toContain('- [ ] [[Migration Initiative]] Write monitoring runbook');
		});

		it('takes task with children', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Define rollback strategy
  - Need to consider 3 failure modes
  - Check with ops team
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: '',
				today,
				cursorLine: 0
			});

			// Source: task scheduled, children removed
			expect(result.source).toContain('- [<] Define rollback strategy');
			expect(result.source).not.toContain('failure modes');

			// Daily: task and children present
			expect(result.target).toContain('[[Migration Initiative]] Define rollback strategy');
			expect(result.target).toContain('failure modes');
			expect(result.target).toContain('ops team');
		});
	});

	describe('choosing the target period', () => {
		it('takes the task to the weekly note when the user picks the week', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Define rollback strategy
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: `
## Todo
`,
				period: 'weekly',
				today,
				cursorLine: 0
			});

			expect(result.targetPath).toBe('+Diary/2026/01/2026-01-W05.md');
			expect(result.source).toContain('- [<] Define rollback strategy');
			expect(result.target).toContain('[[Migration Initiative]] Define rollback strategy');
		});

		it('takes the task to the monthly note when the user picks the month', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Define rollback strategy
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: '',
				period: 'monthly',
				today,
				cursorLine: 0
			});

			expect(result.targetPath).toBe('+Diary/2026/2026-01 Jan.md');
			expect(result.target).toContain('[[Migration Initiative]] Define rollback strategy');
		});

		it('takes the task to the yearly note when the user picks the year', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Define rollback strategy
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: '',
				period: 'yearly',
				today,
				cursorLine: 0
			});

			expect(result.targetPath).toBe('+Diary/2026/2026.md');
			expect(result.target).toContain('[[Migration Initiative]] Define rollback strategy');
		});

		it('offers the note each period would write to', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Define rollback strategy
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: '',
				today,
				cursorLine: 0
			});

			expect(result.pickerHints).toEqual({
				daily: '2026-01-30 Fri',
				weekly: '2026-01-W05',
				monthly: '2026-01 Jan',
				yearly: '2026'
			});
		});

		it('names the chosen period in the notice', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Define rollback strategy
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: '',
				period: 'monthly',
				today,
				cursorLine: 0
			});

			expect(result.notice).toBe('Take project task: Task taken to monthly note.');
		});

		it('leaves both notes untouched when the picker is dismissed', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Define rollback strategy
  - Child note
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: `
## Todo
`,
				period: null,
				today,
				cursorLine: 0
			});

			expect(result.source).toContain('- [ ] Define rollback strategy');
			expect(result.source).toContain('- Child note');
			expect(result.target).not.toContain('Migration Initiative');
			expect(result.notices).toEqual([]);
		});
	});

	describe('grouping follows the target note', () => {
		it('lands beside an existing collector in a weekly note, not under it', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Define rollback strategy
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: `
## Todo
- [ ] Push [[Migration Initiative]]
	- [ ] Some other task
`,
				period: 'weekly',
				today,
				cursorLine: 0
			});

			const lines = result.target!.split('\n');
			expect(lines).toContain('- [ ] [[Migration Initiative]] Define rollback strategy');
			expect(lines).not.toContain('\t- [ ] Define rollback strategy');
			expect(lines).toContain('\t- [ ] Some other task');
		});

		it('takes several tasks as prefixed siblings in a monthly note without a collector', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] First task
- [ ] Second task
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: `
## Todo
`,
				period: 'monthly',
				today,
				selectionStartLine: 0,
				selectionEndLine: 1
			});

			const lines = result.target!.split('\n');
			expect(result.target).not.toContain('Push [[Migration Initiative]]');
			expect(lines).toContain('- [ ] [[Migration Initiative]] First task');
			expect(lines).toContain('- [ ] [[Migration Initiative]] Second task');
		});

		it('takes into the Todo body of a weekly note, not into a day sub-section', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Define rollback strategy
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: `
## Todo

### Monday
- [ ] [[Migration Initiative]] Prioritised task
`,
				period: 'weekly',
				today,
				cursorLine: 0
			});

			expect(result.target).toContain(`## Todo
- [ ] [[Migration Initiative]] Define rollback strategy

### Monday
- [ ] [[Migration Initiative]] Prioritised task`);
		});
	});

	describe('never groups in the daily note', () => {
		it('does not insert under an existing "Push [[Project]]" collector', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Define rollback strategy
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: `
- [ ] Push [[Migration Initiative]]
	- [ ] Some other task
- [ ] Unrelated
`,
				today,
				cursorLine: 0
			});

			// Task arrives as a top-level prefixed task, not nested under the collector
			expect(result.target).toContain('- [ ] [[Migration Initiative]] Define rollback strategy');
			const lines = result.target!.split('\n');
			expect(lines).not.toContain('\t- [ ] Define rollback strategy');
			// The collector and its existing child are untouched
			expect(result.target).toContain('- [ ] Push [[Migration Initiative]]');
			expect(result.target).toContain('\t- [ ] Some other task');
		});

		it('does not insert under a "Finish [[Project]]" collector either', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Final review
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: `
- [ ] Finish [[Migration Initiative]]
`,
				today,
				cursorLine: 0
			});

			expect(result.target).toContain('- [ ] Finish [[Migration Initiative]]');
			expect(result.target).toContain('- [ ] [[Migration Initiative]] Final review');
			const lines = result.target!.split('\n');
			expect(lines).not.toContain('\t- [ ] Final review');
		});

		it('does not match partial keyword prefix as a collector', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Some task
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: `
## Log
- [ ] Pushing [[Migration Initiative]]
`,
				today,
				cursorLine: 0
			});

			expect(result.target).toContain('## Log');
			expect(result.target).toContain('[[Migration Initiative]] Some task');
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
				targetNoteContent: '',
				today,
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			// All source tasks marked as scheduled
			expect(result.source).toContain('- [<] First task');
			expect(result.source).toContain('- [<] Second task');
			expect(result.source).toContain('- [<] Third task');

			// Daily: no collector, each task individually prefixed
			expect(result.target).not.toContain('Push [[Migration Initiative]]');
			expect(result.target).toContain('- [ ] [[Migration Initiative]] First task');
			expect(result.target).toContain('- [ ] [[Migration Initiative]] Second task');
			expect(result.target).toContain('- [ ] [[Migration Initiative]] Third task');
		});

		it('preserves original order across multiple prefixed appends', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] First task
- [ ] Second task
- [ ] Third task
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: '',
				today,
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

		it('keeps single-task takes under the heading with project link (no collector)', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Lone task
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: '',
				today,
				cursorLine: 0
			});

			expect(result.target).toContain('- [ ] [[Migration Initiative]] Lone task');
			expect(result.target).not.toContain('Push [[Migration Initiative]]');
		});

		it('does not group under an existing collector even with multiple tasks selected', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] First task
- [ ] Second task
- [ ] Third task
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: `
- [ ] Push [[Migration Initiative]]
- [ ] Some other task
`,
				today,
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			const lines = result.target!.split('\n');
			expect(lines).not.toContain('\t- [ ] First task');
			expect(result.target).toContain('- [ ] [[Migration Initiative]] First task');
			expect(result.target).toContain('- [ ] [[Migration Initiative]] Second task');
			expect(result.target).toContain('- [ ] [[Migration Initiative]] Third task');
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
				targetNoteContent: `
## Todo
- [<] [[Migration Initiative]] Draft plan
`,
				today,
				cursorLine: 0
			});

			expect(result.target!.match(/Draft plan/g)).toHaveLength(1);
			expect(result.target).toContain('- [ ] [[Migration Initiative]] Draft plan');
			expect(result.target).toContain('- new note');
		});

		it('merges into a copy under a manually created collector', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Draft plan
  - new note
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: `
## Todo
- [ ] Push [[Migration Initiative]]
	- [ ] Draft plan
`,
				today,
				cursorLine: 0
			});

			expect(result.target!.match(/Draft plan/g)).toHaveLength(1);
			expect(result.target).toContain('- new note');
		});

		it('matches an aliased daily copy', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [ ] Draft plan
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: `
## Todo
- [<] [[Migration Initiative|MI]] Draft plan
`,
				today,
				cursorLine: 0
			});

			expect(result.target!.match(/Draft plan/g)).toHaveLength(1);
			expect(result.target).toContain('- [ ] [[Migration Initiative|MI]] Draft plan');
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
				targetNoteContent: '',
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
				targetNoteContent: null,
				today,
				cursorLine: 0
			});

			expect(result.source).toContain('- [<] Some task');
			expect(result.target).toContain('[[Migration Initiative]] Some task');
		});

		it('errors when cursor is not on an incomplete task', async () => {
			const result = await testTakeProjectTaskPlugin({
				source: `
- [x] Completed task
`,
				sourceFileName: 'Migration Initiative',
				targetNoteContent: '',
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
				targetNoteContent: '',
				today,
				cursorLine: 0
			});

			// Source: marked as scheduled
			expect(result.source).toContain('- [<] In progress task');

			// Daily: converted to open
			expect(result.target).toContain('- [ ] [[Migration Initiative]] In progress task');
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
				targetNoteContent: '',
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
