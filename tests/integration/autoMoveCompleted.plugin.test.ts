import { describe, it, expect } from 'vitest';
import { testAutoMove } from '../helpers/autoMovePluginTestHelper';

describe('auto-move', () => {
	describe('plain tasks', () => {
		it('files a ticked task and its children under the log heading', async () => {
			const result = await testAutoMove({
				source: `
## Todo

- [x] Water the plants
	- the big one needs repotting
- [ ] Call the dentist

## Log

- stood up late
`
			});

			expect(result.source).toBe(`
## Todo

- [ ] Call the dentist

## Log
- [x] Water the plants
	- the big one needs repotting

- stood up late
`.trim());
			expect(result.notices).toEqual([]);
		});

		it('leaves a note that is not a daily note alone', async () => {
			const result = await testAutoMove({
				source: `
## Todo

- [x] Water the plants

## Log
`,
				sourceFileName: '2026-W27'
			});

			expect(result.source).toContain('## Todo\n\n- [x] Water the plants');
		});
	});

	describe('project tasks', () => {
		it('completes the task in its project note and files only the task line', async () => {
			const result = await testAutoMove({
				source: `
## Todo

- [x] [[Migration Initiative]] Draft rollout plan
	- agreed on phased approach
- [ ] Call the dentist

## Log

- stood up late
`,
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan

## Log
`
				}
			});

			// Daily note: the task line files under Log, the children went to the project
			expect(result.source).toBe(`
## Todo

- [ ] Call the dentist

## Log
- [x] [[Migration Initiative]] Draft rollout plan

- stood up late
`.trim());

			// Project note: the Todo copy is gone, the log holds task and children
			const project = result.project('Migration Initiative')!;
			expect(project).not.toContain('[<]');
			const logIdx = project.indexOf('## Log');
			expect(project.slice(0, logIdx)).not.toContain('Draft rollout plan');
			expect(project.slice(logIdx)).toContain('### [[2026-07-02 Thu]]');
			expect(project.slice(logIdx)).toContain('- [x] Draft rollout plan');
			expect(project.slice(logIdx)).toContain('agreed on phased approach');

			expect(result.notice).toBe(
				'Complete project task: Task completed and logged to [[Migration Initiative]].'
			);
		});

		it('matches an aliased project link', async () => {
			const result = await testAutoMove({
				source: `
## Todo

- [x] [[Migration Initiative|MI]] Draft rollout plan

## Log
`,
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan

## Log
`
				}
			});

			expect(result.source).toContain('- [x] [[Migration Initiative|MI]] Draft rollout plan');

			const project = result.project('Migration Initiative')!;
			expect(project).not.toContain('|MI');
			expect(project.match(/Draft rollout plan/g)).toHaveLength(1);
			expect(project.slice(project.indexOf('## Log'))).toContain('- [x] Draft rollout plan');
		});

		it('logs a task the project never listed', async () => {
			const result = await testAutoMove({
				source: `
## Todo

- [x] [[Migration Initiative]] Reworded since it was taken
	- what actually happened

## Log
`,
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan

## Log
`
				}
			});

			// Filed like any other project task: line to Log, notes to the project
			expect(result.source).toContain(
				'## Log\n- [x] [[Migration Initiative]] Reworded since it was taken'
			);
			expect(result.source).not.toContain('what actually happened');

			const project = result.project('Migration Initiative')!;
			expect(project).toContain('- [<] Draft rollout plan');
			const log = project.slice(project.indexOf('## Log'));
			expect(log).toContain('### [[2026-07-02 Thu]]');
			expect(log).toContain('- [x] Reworded since it was taken');
			expect(log).toContain('what actually happened');

			// A task the project never listed is normal here, not worth reporting
			expect(result.notice).toBe(
				'Complete project task: Task completed and logged to [[Migration Initiative]].'
			);
		});

		it('logs a completion again on a later day', async () => {
			const result = await testAutoMove({
				source: `
## Todo

- [x] [[Migration Initiative]] Weekly report

## Log
`,
				projectNotes: {
					'Migration Initiative': `
## Todo

## Log

### [[2026-07-01 Tue]]

- [x] Weekly report
`
				}
			});

			// Yesterday's entry doesn't stand in for today's
			const project = result.project('Migration Initiative')!;
			expect(project).toContain('### [[2026-07-02 Thu]]');
			expect(project.match(/- \[x\] Weekly report/g)).toHaveLength(2);
		});

		it('does not log a second time when the completion is already in the project log', async () => {
			// What the daily note looks like right after Complete project task:
			// the task is [x] in place, its children moved to the project log
			const result = await testAutoMove({
				source: `
## Todo

- [x] [[Migration Initiative]] Draft rollout plan

## Log
`,
				projectNotes: {
					'Migration Initiative': `
## Todo

## Log

### [[2026-07-02 Thu]]

- [x] Draft rollout plan
	- agreed on phased approach
`
				}
			});

			expect(result.source).toContain('## Log\n- [x] [[Migration Initiative]] Draft rollout plan');

			const project = result.project('Migration Initiative')!;
			expect(project.match(/Draft rollout plan/g)).toHaveLength(1);
			expect(project.match(/### \[\[2026-07-02 Thu\]\]/g)).toHaveLength(1);
			expect(result.notices).toEqual([]);
		});

		it('leaves the daily note untouched when the project write fails', async () => {
			const source = `
## Todo

- [x] [[Migration Initiative]] Draft rollout plan
	- agreed on phased approach

## Log
`;
			const result = await testAutoMove({
				source,
				projectNotes: { 'Migration Initiative': '## Todo\n- [<] Draft rollout plan\n\n## Log' },
				failProjectWrite: true
			});

			expect(result.source).toBe(source.trim());
			expect(result.notice).toContain('Complete project task error');
		});

		it('does not touch the project when the task is only started', async () => {
			const result = await testAutoMove({
				source: `
## Todo

- [/] [[Migration Initiative]] Draft rollout plan
	- agreed on phased approach

## Log
`,
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan

## Log
`
				}
			});

			// Started tasks file under Log with their children, as before
			expect(result.source).toBe(`
## Todo


## Log
- [/] [[Migration Initiative]] Draft rollout plan
	- agreed on phased approach
`.trim());
			expect(result.project('Migration Initiative')).toContain('- [<] Draft rollout plan');
			expect(result.notices).toEqual([]);
		});

		it('does not complete a subtask of a project task', async () => {
			const result = await testAutoMove({
				source: `
## Todo

- [ ] [[Migration Initiative]] Draft rollout plan
	- [x] collect the numbers

## Log
`,
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan

## Log
`
				}
			});

			// The whole block files under Log, project note untouched
			expect(result.source).toBe(`
## Todo


## Log
- [ ] [[Migration Initiative]] Draft rollout plan
	- [x] collect the numbers
`.trim());
			expect(result.project('Migration Initiative')).toContain('- [<] Draft rollout plan');
			expect(result.notices).toEqual([]);
		});

		it('ignores a project link that is not the task prefix', async () => {
			const result = await testAutoMove({
				source: `
## Todo

- [x] Ask about [[Migration Initiative]] tomorrow
	- ping the team lead

## Log
`,
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan

## Log
`
				}
			});

			expect(result.source).toContain('- [x] Ask about [[Migration Initiative]] tomorrow\n\t- ping the team lead');
			expect(result.project('Migration Initiative')).toContain('- [<] Draft rollout plan');
		});
	});

	describe('edits during the project write', () => {
		it('follows the task when the document shifts under it', async () => {
			const result = await testAutoMove({
				source: `
## Todo

- [x] [[Migration Initiative]] Draft rollout plan

## Log
`,
				projectNotes: { 'Migration Initiative': '## Todo\n- [<] Draft rollout plan\n\n## Log' },
				editDuringProjectWrite: (text) =>
					text.replace('## Todo\n', '## Todo\n\n- [ ] Typed while saving')
			});

			expect(result.source).toBe(`
## Todo

- [ ] Typed while saving

## Log
- [x] [[Migration Initiative]] Draft rollout plan
`.trim());
		});

		it('leaves the task in place when it changed while the project was written', async () => {
			const result = await testAutoMove({
				source: `
## Todo

- [x] [[Migration Initiative]] Draft rollout plan

## Log
`,
				projectNotes: { 'Migration Initiative': '## Todo\n- [<] Draft rollout plan\n\n## Log' },
				editDuringProjectWrite: (text) => text.replace('Draft rollout plan', 'Draft rollout plan v2')
			});

			// The project note has the entry; the daily note keeps the edited line
			expect(result.source).toContain('## Todo\n\n- [x] [[Migration Initiative]] Draft rollout plan v2');
			expect(result.project('Migration Initiative')!).toContain('- [x] Draft rollout plan');
		});
	});
});
