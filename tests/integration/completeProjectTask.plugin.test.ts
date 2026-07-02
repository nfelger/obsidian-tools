import { describe, it, expect } from 'vitest';
import { testCompleteProjectTaskPlugin } from '../helpers/completeProjectTaskPluginTestHelper';

describe('completeProjectTask', () => {
	describe('happy path', () => {
		it('marks the [<] copy done, logs to the project, and completes the daily task in place', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft rollout plan
  - agreed on phased approach
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan

## Log
`
				},
				cursorLine: 0
			});

			// Source: task completed IN PLACE, children untouched
			expect(result.source).toContain('- [x] [[Migration Initiative]] Draft rollout plan');
			expect(result.source).toContain('agreed on phased approach');

			// Project: [<] copy flipped to [x]
			const project = result.project('Migration Initiative')!;
			expect(project).toContain('- [x] Draft rollout plan');
			expect(project).not.toContain('[<]');

			// Project: log entry with sub-heading, completed task line, and children copy
			expect(project).toContain('### [[2026-07-02 Thu]]');
			const logIdx = project.indexOf('## Log');
			expect(project.indexOf('### [[2026-07-02 Thu]]')).toBeGreaterThan(logIdx);
			expect(project.slice(logIdx)).toContain('- [x] Draft rollout plan');
			expect(project.slice(logIdx)).toContain('agreed on phased approach');
		});

		it('resolves the project from a Push [[Project]] collector ancestor', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] Push [[Migration Initiative]]
	- [ ] Draft rollout plan
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan

## Log
`
				},
				cursorLine: 1
			});

			expect(result.source).toContain('- [x] Draft rollout plan');
			// Collector itself stays open
			expect(result.source).toContain('- [ ] Push [[Migration Initiative]]');

			const project = result.project('Migration Initiative')!;
			expect(project).toContain('- [x] Draft rollout plan');
			expect(project).toContain('### [[2026-07-02 Thu]]');
		});

		it('completes a started [/] task as [x] everywhere', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [/] [[Migration Initiative]] Draft rollout plan
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan

## Log
`
				},
				cursorLine: 0
			});

			expect(result.source).toContain('- [x] [[Migration Initiative]] Draft rollout plan');
			const project = result.project('Migration Initiative')!;
			expect(project.slice(project.indexOf('## Log'))).toContain('- [x] Draft rollout plan');
		});

		it('inserts new entries directly after the log heading (reverse-chronological)', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft rollout plan
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan

## Log

### [[2026-07-01 Wed]]

- older entry
`
				},
				cursorLine: 0
			});

			const project = result.project('Migration Initiative')!;
			expect(project.indexOf('### [[2026-07-02 Thu]]')).toBeLessThan(project.indexOf('### [[2026-07-01 Wed]]'));
		});

		it('creates the log heading at the end of the file when missing', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft rollout plan
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan
`
				},
				cursorLine: 0
			});

			const project = result.project('Migration Initiative')!;
			expect(project).toContain('## Log');
			expect(project.indexOf('## Log')).toBeGreaterThan(project.indexOf('## Todo'));
			expect(project.slice(project.indexOf('## Log'))).toContain('### [[2026-07-02 Thu]]');
		});

		it('re-indents copied children to the project note indent unit', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft rollout plan
  - two-space child
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan
\t- tab-indented existing child

## Log
`
				},
				cursorLine: 0
			});

			const project = result.project('Migration Initiative')!;
			expect(project).toContain('\t- two-space child');
			expect(project).not.toContain('  - two-space child');
		});
	});

	describe('mismatches', () => {
		it('still logs and completes the source when no matching task exists in the project', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft rollout plan
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [ ] Something unrelated

## Log
`
				},
				cursorLine: 0
			});

			expect(result.source).toContain('- [x] [[Migration Initiative]] Draft rollout plan');
			const project = result.project('Migration Initiative')!;
			expect(project).toContain('### [[2026-07-02 Thu]]');
			expect(project).toContain('- [ ] Something unrelated');
			expect(result.notices.some(n => n.includes('no matching task'))).toBe(true);
		});

		it('does not double-mark an already completed project copy', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft rollout plan
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [x] Draft rollout plan

## Log
`
				},
				cursorLine: 0
			});

			expect(result.source).toContain('- [x] [[Migration Initiative]] Draft rollout plan');
			const project = result.project('Migration Initiative')!;
			// Only the Todo copy plus the log entry copy — no extra markings
			expect(project.slice(project.indexOf('## Log'))).toContain('- [x] Draft rollout plan');
			expect(result.notices.some(n => n.includes('already completed'))).toBe(true);
		});
	});

	describe('multi-select', () => {
		it('groups tasks per project with one sub-heading per project per run', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft rollout plan
- [ ] [[Migration Initiative]] Write runbook
- [ ] [[Engineering Update]] Collect metrics
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan
- [<] Write runbook

## Log
`,
					'Engineering Update': `
## Todo
- [<] Collect metrics

## Log
`
				},
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			expect(result.source).toContain('- [x] [[Migration Initiative]] Draft rollout plan');
			expect(result.source).toContain('- [x] [[Migration Initiative]] Write runbook');
			expect(result.source).toContain('- [x] [[Engineering Update]] Collect metrics');

			const migration = result.project('Migration Initiative')!;
			expect(migration.match(/### \[\[2026-07-02 Thu\]\]/g)).toHaveLength(1);
			const migrationLog = migration.slice(migration.indexOf('## Log'));
			expect(migrationLog).toContain('- [x] Draft rollout plan');
			expect(migrationLog).toContain('- [x] Write runbook');
			expect(migration).not.toContain('[<]');

			const engineering = result.project('Engineering Update')!;
			expect(engineering.slice(engineering.indexOf('## Log'))).toContain('- [x] Collect metrics');
		});
	});

	describe('validation and safety', () => {
		it('errors when cursor is not on an incomplete task', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [x] [[Migration Initiative]] Done task
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': '## Todo'
				},
				cursorLine: 0
			});

			expect(result.notice).toContain('not on an incomplete task');
			expect(result.source).toContain('- [x] [[Migration Initiative]] Done task');
		});

		it('refuses to run inside a project note', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] Draft rollout plan
`,
				sourceFileName: 'Migration Initiative',
				sourcePath: '1 Projekte/Migration Initiative.md',
				cursorLine: 0
			});

			expect(result.notice).toContain('Already in a project note');
		});

		it('notices when a task has no project link', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] Task without any link
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				cursorLine: 0
			});

			expect(result.notices.some(n => n.includes('No project link'))).toBe(true);
			expect(result.source).toContain('- [ ] Task without any link');
		});

		it('leaves the source untouched when the project write fails', async () => {
			const result = await testCompleteProjectTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft rollout plan
`,
				sourceFileName: '2026-07-02 Thu',
				sourcePath: '+Diary/2026/07/2026-07-02 Thu.md',
				projectNotes: {
					'Migration Initiative': `
## Todo
- [<] Draft rollout plan
`
				},
				cursorLine: 0,
				failTargetWrite: true
			});

			expect(result.source).toContain('- [ ] [[Migration Initiative]] Draft rollout plan');
			expect(result.error).toContain('Simulated write failure');
		});
	});
});
