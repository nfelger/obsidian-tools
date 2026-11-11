import { describe, it, expect } from 'vitest';
import { testCascade, CASCADE_NOTE_PATHS } from '../helpers/cascadePluginTestHelper';

describe('periodic cascade', () => {
	describe('weekly notes', () => {
		it('files a ticked task into the daily log and keeps it scheduled in the week', async () => {
			const result = await testCascade({
				source: `
## Todo

- [x] Call Sam
`,
				sourcePath: CASCADE_NOTE_PATHS.weekly,
				notes: {
					[CASCADE_NOTE_PATHS.daily]: `
## Todo

- [ ] Water the plants

## Log
`
				}
			});

			expect(result.source).toBe(`
## Todo

- [<] Call Sam
`.trim());

			expect(result.note(CASCADE_NOTE_PATHS.daily)).toBe(`
## Todo

- [ ] Water the plants

## Log
- [x] Call Sam
`.trim());
		});

		it('cascades a task ticked outside the Todo section', async () => {
			const result = await testCascade({
				source: `
## Notes

- [x] Call Sam
`,
				sourcePath: CASCADE_NOTE_PATHS.weekly,
				notes: {
					[CASCADE_NOTE_PATHS.daily]: `
## Log
`
				}
			});

			expect(result.source).toContain('- [<] Call Sam');
			expect(result.note(CASCADE_NOTE_PATHS.daily)).toContain('- [x] Call Sam');
		});

		it('leaves the task alone when today is not in the note\'s period', async () => {
			const result = await testCascade({
				source: `
## Todo

- [x] Call Sam
`,
				sourcePath: 'Diary/2026-W20.md',
				notes: {
					[CASCADE_NOTE_PATHS.daily]: `
## Log
`
				}
			});

			expect(result.source).toContain('- [x] Call Sam');
			expect(result.note(CASCADE_NOTE_PATHS.daily)).toBe(`
## Log
`.trim());
			expect(result.notices.length).toBe(1);
		});
	});

	describe('monthly and yearly notes', () => {
		it('cascades a monthly task through the week into the daily log', async () => {
			const result = await testCascade({
				source: `
## Todo

- [x] Call Sam
`,
				sourcePath: CASCADE_NOTE_PATHS.monthly,
				notes: {
					[CASCADE_NOTE_PATHS.weekly]: `
## Todo
`,
					[CASCADE_NOTE_PATHS.daily]: `
## Log
`
				}
			});

			expect(result.source).toContain('- [<] Call Sam');
			expect(result.note(CASCADE_NOTE_PATHS.weekly)).toContain('- [<] Call Sam');
			expect(result.note(CASCADE_NOTE_PATHS.daily)).toContain('- [x] Call Sam');
		});

		it('cascades a yearly task through the month and the week into the daily log', async () => {
			const result = await testCascade({
				source: `
## Todo

- [x] Call Sam
`,
				sourcePath: CASCADE_NOTE_PATHS.yearly,
				notes: {
					[CASCADE_NOTE_PATHS.monthly]: `
## Todo
`,
					[CASCADE_NOTE_PATHS.weekly]: `
## Todo
`,
					[CASCADE_NOTE_PATHS.daily]: `
## Log
`
				}
			});

			expect(result.source).toContain('- [<] Call Sam');
			expect(result.note(CASCADE_NOTE_PATHS.monthly)).toContain('- [<] Call Sam');
			expect(result.note(CASCADE_NOTE_PATHS.weekly)).toContain('- [<] Call Sam');
			expect(result.note(CASCADE_NOTE_PATHS.daily)).toContain('- [x] Call Sam');
		});
	});

	describe('children', () => {
		it('cascades a ticked subtask on its own and leaves the parent open', async () => {
			const result = await testCascade({
				source: `
## Todo

- [ ] Call Sam
	- [x] Ask about pricing
`,
				sourcePath: CASCADE_NOTE_PATHS.weekly,
				notes: {
					[CASCADE_NOTE_PATHS.daily]: `
## Log
`
				}
			});

			expect(result.source).toContain('- [ ] Call Sam');
			expect(result.note(CASCADE_NOTE_PATHS.daily)).toContain('- [x] Ask about pricing');
		});

		it('takes the open child along and leaves the completed child in the source', async () => {
			const result = await testCascade({
				source: `
## Todo

- [x] Call Sam
	- [ ] Ask about pricing
	- [x] Send the invoice
`,
				sourcePath: CASCADE_NOTE_PATHS.weekly,
				notes: {
					[CASCADE_NOTE_PATHS.daily]: `
## Log
`
				}
			});

			expect(result.source).toContain('- [<] Call Sam');
			expect(result.source).toContain('- [x] Send the invoice');
			expect(result.source).not.toContain('Ask about pricing');
			expect(result.note(CASCADE_NOTE_PATHS.daily)).toContain('Ask about pricing');
		});
	});

	describe('merging', () => {
		it('merges with a task the week already holds and keeps both sets of children', async () => {
			const result = await testCascade({
				source: `
## Todo

- [x] Call Sam
	- Ask about pricing
`,
				sourcePath: CASCADE_NOTE_PATHS.monthly,
				notes: {
					[CASCADE_NOTE_PATHS.weekly]: `
## Todo

- [<] Call Sam
	- Confirm the time
`,
					[CASCADE_NOTE_PATHS.daily]: `
## Log
`
				}
			});

			const week = result.note(CASCADE_NOTE_PATHS.weekly)!;
			expect(week.match(/Call Sam/g)?.length).toBe(1);
			expect(week).toContain('- [<] Call Sam');
			expect(week).toContain('Confirm the time');
			expect(week).toContain('Ask about pricing');

			const daily = result.note(CASCADE_NOTE_PATHS.daily)!;
			expect(daily).toContain('- [x] Call Sam');
			expect(daily).toContain('Confirm the time');
			expect(daily).toContain('Ask about pricing');
		});
	});

	describe('project tasks', () => {
		it('logs the completion in the project note under the daily note', async () => {
			const result = await testCascade({
				source: `
## Todo

- [x] [[Migration Initiative]] Draft rollout plan
	- agreed on a phased approach
`,
				sourcePath: CASCADE_NOTE_PATHS.weekly,
				notes: {
					[CASCADE_NOTE_PATHS.daily]: `
## Log
`
				},
				projectNotes: {
					'Migration Initiative': `
## Todo

- [<] Draft rollout plan

## Log
`
				}
			});

			expect(result.source).toContain('- [<] [[Migration Initiative]] Draft rollout plan');

			const daily = result.note(CASCADE_NOTE_PATHS.daily)!;
			expect(daily).toContain('- [x] [[Migration Initiative]] Draft rollout plan');
			expect(daily).not.toContain('agreed on a phased approach');

			const project = result.project('Migration Initiative')!;
			expect(project).toContain('### [[2026-07-02 Thu]]');
			expect(project).toContain('- [x] Draft rollout plan');
			expect(project).toContain('agreed on a phased approach');
		});

		it('does not log the completion twice when the project note already holds it', async () => {
			const result = await testCascade({
				source: `
## Todo

- [x] [[Migration Initiative]] Draft rollout plan
`,
				sourcePath: CASCADE_NOTE_PATHS.weekly,
				notes: {
					[CASCADE_NOTE_PATHS.daily]: `
## Log
`
				},
				projectNotes: {
					'Migration Initiative': `
## Todo

## Log

### [[2026-W27]]

- [x] Draft rollout plan
`
				}
			});

			// The task still reaches the daily log ...
			expect(result.note(CASCADE_NOTE_PATHS.daily)).toContain('- [x] [[Migration Initiative]] Draft rollout plan');

			// ... but the project note keeps a single entry
			const project = result.project('Migration Initiative')!;
			expect(project.match(/Draft rollout plan/g)?.length).toBe(1);
			expect(project).not.toContain('[[2026-07-02 Thu]]');
		});
	});

	describe('missing notes', () => {
		it('creates the notes it needs on the way down', async () => {
			const result = await testCascade({
				source: `
## Todo

- [x] Call Sam
`,
				sourcePath: CASCADE_NOTE_PATHS.monthly
			});

			expect(result.source).toContain('- [<] Call Sam');
			expect(result.note(CASCADE_NOTE_PATHS.weekly)).toContain('- [<] Call Sam');
			expect(result.note(CASCADE_NOTE_PATHS.daily)).toContain('- [x] Call Sam');
		});
	});

	describe('other triggers', () => {
		it('does nothing when a task is started in a weekly note', async () => {
			const result = await testCascade({
				source: `
## Todo

- [/] Call Sam
`,
				sourcePath: CASCADE_NOTE_PATHS.weekly,
				notes: {
					[CASCADE_NOTE_PATHS.daily]: `
## Log
`
				},
				tickedLine: ''
			});

			expect(result.source).toContain('- [/] Call Sam');
			expect(result.note(CASCADE_NOTE_PATHS.daily)).toBe(`
## Log
`.trim());
		});

		it('leaves a daily note to its own path', async () => {
			const result = await testCascade({
				source: `
## Todo

- [x] Call Sam
`,
				sourcePath: CASCADE_NOTE_PATHS.daily
			});

			// The daily note keeps its own path: the task moves to its log
			expect(result.source).toBe(`
## Todo


## Log
- [x] Call Sam
`.trim());
		});

		it('allows a duplicate of a task the daily note already holds', async () => {
			const result = await testCascade({
				source: `
## Todo

- [x] Call Sam
`,
				sourcePath: CASCADE_NOTE_PATHS.weekly,
				notes: {
					[CASCADE_NOTE_PATHS.daily]: `
## Todo

- [ ] Call Sam

## Log
`
				}
			});

			const daily = result.note(CASCADE_NOTE_PATHS.daily)!;
			expect(daily).toContain('- [ ] Call Sam');
			expect(daily).toContain('- [x] Call Sam');
		});
	});

	describe('failures', () => {
		it('leaves the source untouched when the daily note cannot be written', async () => {
			const result = await testCascade({
				source: `
## Todo

- [x] Call Sam
`,
				sourcePath: CASCADE_NOTE_PATHS.weekly,
				notes: {
					[CASCADE_NOTE_PATHS.daily]: `
## Log
`
				},
				failDailyWrite: true
			});

			expect(result.source).toContain('- [x] Call Sam');
			expect(result.notices.length).toBe(1);
		});
	});
});
