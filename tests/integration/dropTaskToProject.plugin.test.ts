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

		it('shows error when no project link found', async () => {
			const result = await testDropTaskToProjectPlugin({
				source: `
- [ ] Task without any link
`,
				sourceFileName: '2026-01-30 Fri',
				sourcePath: '+Diary/2026/01/2026-01-30 Fri.md',
				projectNotes: {},
				cursorLine: 0
			});

			expect(result.notice).toContain('No project link found');
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
});
