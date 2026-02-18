import { describe, it, expect } from 'vitest';
import { testDropTaskToProjectPlugin } from '../helpers/dropTaskToProjectPluginTestHelper';

describe('dropTaskToProject', () => {
	describe('new task to project', () => {
		it('drops a task with [[Project]] link to the project note', async () => {
			const result = await testDropTaskToProjectPlugin({
				source: `
- [ ] [[Migration Initiative]] Write monitoring runbook
`,
				sourceFileName: '2026-01-30 Fri',
				sourcePath: '+Diary/2026/01/2026-01-30 Fri.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [ ] Define rollback strategy
`
				},
				cursorLine: 0
			});

			// Source: task line deleted
			expect(result.source).not.toContain('monitoring runbook');

			// Project: new task added under ## Todo
			const project = result.project('Migration Initiative');
			expect(project).toContain('Write monitoring runbook');
			expect(project).toContain('Define rollback strategy');
		});

		it('strips [[Project]] prefix when adding to project note', async () => {
			const result = await testDropTaskToProjectPlugin({
				source: `
- [ ] [[Migration Initiative]] Write runbook
`,
				sourceFileName: '2026-01-30 Fri',
				sourcePath: '+Diary/2026/01/2026-01-30 Fri.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
`
				},
				cursorLine: 0
			});

			const project = result.project('Migration Initiative');
			// Should NOT have [[Migration Initiative]] prefix in the project note
			expect(project).toContain('- [ ] Write runbook');
			expect(project).not.toContain('[[Migration Initiative]] Write runbook');
		});

		it('drops task with children to project', async () => {
			const result = await testDropTaskToProjectPlugin({
				source: `
- [ ] [[Migration Initiative]] Write runbook
  - Include rollback steps
  - Cover monitoring gaps
`,
				sourceFileName: '2026-01-30 Fri',
				sourcePath: '+Diary/2026/01/2026-01-30 Fri.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
`
				},
				cursorLine: 0
			});

			// Source: task and children deleted
			expect(result.source).not.toContain('runbook');
			expect(result.source).not.toContain('rollback steps');

			// Project: task and children present
			const project = result.project('Migration Initiative');
			expect(project).toContain('Write runbook');
			expect(project).toContain('rollback steps');
			expect(project).toContain('monitoring gaps');
		});
	});

	describe('returning a scheduled task', () => {
		it('reopens a scheduled [<] task in the project when dropped back', async () => {
			const result = await testDropTaskToProjectPlugin({
				source: `
- [ ] [[Migration Initiative]] Define rollback strategy
`,
				sourceFileName: '2026-01-30 Fri',
				sourcePath: '+Diary/2026/01/2026-01-30 Fri.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Define rollback strategy
`
				},
				cursorLine: 0
			});

			// Source: deleted
			expect(result.source).not.toContain('Define rollback strategy');

			// Project: reopened as [ ]
			const project = result.project('Migration Initiative');
			expect(project).toContain('- [ ] Define rollback strategy');
			expect(project).not.toContain('[<]');
		});
	});

	describe('validation', () => {
		it('errors when cursor is not on an incomplete task', async () => {
			const result = await testDropTaskToProjectPlugin({
				source: `
- [x] [[Migration Initiative]] Done task
`,
				sourceFileName: '2026-01-30 Fri',
				sourcePath: '+Diary/2026/01/2026-01-30 Fri.md',
				projectNotes: {
					'Migration Initiative': '## Todo'
				},
				cursorLine: 0
			});

			expect(result.notice).toContain('not on an incomplete task');
		});

		it('errors when already in a project note', async () => {
			const result = await testDropTaskToProjectPlugin({
				source: `
- [ ] Some task
`,
				sourceFileName: 'Migration Initiative',
				sourcePath: '1 Projekte/Migration Initiative.md',
				projectNotes: {},
				cursorLine: 0
			});

			expect(result.notice).toContain('Already in a project note');
		});

		it('silently does nothing when no project link and no picker selection', async () => {
			const result = await testDropTaskToProjectPlugin({
				source: `
- [ ] Task without any link
`,
				sourceFileName: '2026-01-30 Fri',
				sourcePath: '+Diary/2026/01/2026-01-30 Fri.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
`
				},
				cursorLine: 0,
				pickerSelection: null
			});

			// Source: task remains (picker was cancelled)
			expect(result.source).toContain('Task without any link');
			// No error notice
			expect(result.notices).toHaveLength(0);
		});
	});

	describe('multi-select', () => {
		it('drops multiple tasks to the same project', async () => {
			const result = await testDropTaskToProjectPlugin({
				source: `
- [ ] [[Migration Initiative]] First task
- [ ] [[Migration Initiative]] Second task
`,
				sourceFileName: '2026-01-30 Fri',
				sourcePath: '+Diary/2026/01/2026-01-30 Fri.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
`
				},
				selectionStartLine: 0,
				selectionEndLine: 1
			});

			// Source: both tasks deleted
			expect(result.source).not.toContain('First task');
			expect(result.source).not.toContain('Second task');

			// Project: both tasks added
			const project = result.project('Migration Initiative');
			expect(project).toContain('First task');
			expect(project).toContain('Second task');
		});

		it('preserves original order of tasks in project', async () => {
			const result = await testDropTaskToProjectPlugin({
				source: `
- [ ] [[Migration Initiative]] First task
- [ ] [[Migration Initiative]] Second task
- [ ] [[Migration Initiative]] Third task
`,
				sourceFileName: '2026-01-30 Fri',
				sourcePath: '+Diary/2026/01/2026-01-30 Fri.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
`
				},
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			const project = result.project('Migration Initiative')!;
			const firstIdx = project.indexOf('First task');
			const secondIdx = project.indexOf('Second task');
			const thirdIdx = project.indexOf('Third task');

			expect(firstIdx).toBeGreaterThan(-1);
			expect(secondIdx).toBeGreaterThan(firstIdx);
			expect(thirdIdx).toBeGreaterThan(secondIdx);
		});
	});

	describe('project selection dialog', () => {
		it('drops task to user-selected project when no link found', async () => {
			const result = await testDropTaskToProjectPlugin({
				source: `
- [ ] Write monitoring runbook
`,
				sourceFileName: '2026-01-30 Fri',
				sourcePath: '+Diary/2026/01/2026-01-30 Fri.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [ ] Define rollback strategy
`
				},
				cursorLine: 0,
				pickerSelection: 'Migration Initiative'
			});

			// Source: task deleted
			expect(result.source).not.toContain('monitoring runbook');

			// Project: task added under ## Todo
			const project = result.project('Migration Initiative');
			expect(project).toContain('Write monitoring runbook');
			expect(project).toContain('Define rollback strategy');
		});

		it('leaves task in source when user cancels the picker', async () => {
			const result = await testDropTaskToProjectPlugin({
				source: `
- [ ] Write monitoring runbook
`,
				sourceFileName: '2026-01-30 Fri',
				sourcePath: '+Diary/2026/01/2026-01-30 Fri.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
`
				},
				cursorLine: 0,
				pickerSelection: null
			});

			// Source: task remains
			expect(result.source).toContain('Write monitoring runbook');

			// Project: unchanged
			const project = result.project('Migration Initiative');
			expect(project).not.toContain('monitoring runbook');
		});

		it('drops linked tasks immediately and shows picker for unlinked ones', async () => {
			const result = await testDropTaskToProjectPlugin({
				source: `
- [ ] [[Migration Initiative]] Linked task
- [ ] Unlinked task
`,
				sourceFileName: '2026-01-30 Fri',
				sourcePath: '+Diary/2026/01/2026-01-30 Fri.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
`,
					'Platform Upgrade': `
## Todo
`
				},
				selectionStartLine: 0,
				selectionEndLine: 1,
				pickerSelection: 'Platform Upgrade'
			});

			// Source: both tasks deleted
			expect(result.source).not.toContain('Linked task');
			expect(result.source).not.toContain('Unlinked task');

			// Linked task goes to its project
			const migration = result.project('Migration Initiative');
			expect(migration).toContain('Linked task');
			expect(migration).not.toContain('Unlinked task');

			// Unlinked task goes to the picked project
			const platform = result.project('Platform Upgrade');
			expect(platform).toContain('Unlinked task');
			expect(platform).not.toContain('Linked task');
		});

		it('drops all unlinked tasks to picker-selected project', async () => {
			const result = await testDropTaskToProjectPlugin({
				source: `
- [ ] First unlinked task
- [ ] Second unlinked task
- [ ] Third unlinked task
`,
				sourceFileName: '2026-01-30 Fri',
				sourcePath: '+Diary/2026/01/2026-01-30 Fri.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
`
				},
				selectionStartLine: 0,
				selectionEndLine: 2,
				pickerSelection: 'Migration Initiative'
			});

			// Source: all tasks deleted
			expect(result.source).not.toContain('First unlinked');
			expect(result.source).not.toContain('Second unlinked');
			expect(result.source).not.toContain('Third unlinked');

			// Project: all tasks added in order
			const project = result.project('Migration Initiative')!;
			expect(project).toContain('First unlinked task');
			expect(project).toContain('Second unlinked task');
			expect(project).toContain('Third unlinked task');

			const firstIdx = project.indexOf('First unlinked');
			const secondIdx = project.indexOf('Second unlinked');
			const thirdIdx = project.indexOf('Third unlinked');
			expect(secondIdx).toBeGreaterThan(firstIdx);
			expect(thirdIdx).toBeGreaterThan(secondIdx);
		});

		it('drops unlinked task with children to picker-selected project', async () => {
			const result = await testDropTaskToProjectPlugin({
				source: `
- [ ] Write runbook
  - Include rollback steps
  - Cover monitoring gaps
`,
				sourceFileName: '2026-01-30 Fri',
				sourcePath: '+Diary/2026/01/2026-01-30 Fri.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
`
				},
				cursorLine: 0,
				pickerSelection: 'Migration Initiative'
			});

			// Source: task and children deleted
			expect(result.source).not.toContain('runbook');
			expect(result.source).not.toContain('rollback steps');

			// Project: task and children present
			const project = result.project('Migration Initiative');
			expect(project).toContain('Write runbook');
			expect(project).toContain('rollback steps');
			expect(project).toContain('monitoring gaps');
		});

		it('only drops linked tasks when picker is cancelled for unlinked ones', async () => {
			const result = await testDropTaskToProjectPlugin({
				source: `
- [ ] [[Migration Initiative]] Linked task
- [ ] Unlinked task
`,
				sourceFileName: '2026-01-30 Fri',
				sourcePath: '+Diary/2026/01/2026-01-30 Fri.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
`
				},
				selectionStartLine: 0,
				selectionEndLine: 1,
				pickerSelection: null
			});

			// Linked task: dropped to project
			expect(result.source).not.toContain('Linked task');
			const project = result.project('Migration Initiative');
			expect(project).toContain('Linked task');

			// Unlinked task: stays in source (picker cancelled)
			expect(result.source).toContain('Unlinked task');
		});
	});
});
