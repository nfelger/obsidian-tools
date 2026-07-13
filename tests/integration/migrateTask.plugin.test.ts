import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testMigrateTaskPlugin } from '../helpers/migrateTaskPluginTestHelper';

describe('migrateTask (plugin)', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('validation', () => {
		it('should do nothing if cursor is not on incomplete task', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [x] Completed task
- Just a note
- [ ] Incomplete task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				cursorLine: 0 // On completed task
			});

			// Source should be unchanged
			expect(result.source).toContain('- [x] Completed task');
			expect(result.notice).toMatch(/not.*incomplete task|no incomplete task/i);
		});

		it('should do nothing for plain bullet points', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- Just a note
- [ ] Incomplete task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				cursorLine: 0
			});

			expect(result.source).toContain('- Just a note');
			expect(result.notice).toMatch(/not.*incomplete task|no incomplete task/i);
		});

		it('should fail if not in a periodic note', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Some task
`,
				sourceFileName: 'Migration Initiative',
				targetContent: '',
				cursorLine: 0
			});

			expect(result.notice).toMatch(/not.*periodic|periodic note/i);
		});

		it('should create the target note when it does not exist', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task to migrate
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: null, // Target doesn't exist
				cursorLine: 0
			});

			expect(result.source).toContain('- [>] Task to migrate');
			expect(result.target).toContain('## Todo');
			expect(result.target).toContain('- [ ] Task to migrate');
		});

		it('applies the Periodic Notes template when creating the target note', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task to migrate
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: null, // Target doesn't exist
				cursorLine: 0,
				periodicNotesTemplate: `
# Daily

## Todo

## Log
`
			});

			// Template content present
			expect(result.target).toContain('# Daily');
			expect(result.target).toContain('## Log');
			// Task inserted under the template's Todo heading, not a duplicate one
			expect(result.target!.match(/## Todo/g)).toHaveLength(1);
			expect(result.target).toContain('- [ ] Task to migrate');
			expect(result.source).toContain('- [>] Task to migrate');
		});
	});

	describe('single line migration - daily notes only', () => {
		it('should migrate a single task to next daily note', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task to migrate
- [ ] Another task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				cursorLine: 0
			});

			// Source should have migrated marker
			expect(result.source).toContain('- [>] Task to migrate');
			// Target should have the task
			expect(result.target).toContain('## Todo');
			expect(result.target).toContain('- [ ] Task to migrate');
			// Next task should be unchanged
			expect(result.source).toContain('- [ ] Another task');
		});

		it('should migrate started task [/] as incomplete', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [/] Started task
- [ ] Regular task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				cursorLine: 0
			});

			// Source should have migrated marker
			expect(result.source).toContain('- [>] Started task');
			// Target should have open task (reset to unchecked)
			expect(result.target).toContain('- [ ] Started task');
		});
	});

	describe('migration with children', () => {
		it('should migrate task with nested children', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Parent task
  - Child 1
  - [ ] Child task
    - Grandchild
- [ ] Next task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				cursorLine: 0
			});

			// Source should have only the parent with migrated marker
			expect(result.source).toContain('- [>] Parent task');
			expect(result.source).not.toContain('Child 1');
			expect(result.source).toContain('- [ ] Next task');

			// Target should have parent and all children
			expect(result.target).toContain('- [ ] Parent task');
			expect(result.target).toContain('Child 1');
			expect(result.target).toContain('Child task');
			expect(result.target).toContain('Grandchild');
		});

		it('should leave completed children behind in the source', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Parent task
  - [x] Done child
    - note under done
  - [ ] Open child
- [ ] Next task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				cursorLine: 0
			});

			// Source keeps the completed subtree under the migrated parent
			expect(result.source).toContain('- [>] Parent task');
			expect(result.source).toContain('- [x] Done child');
			expect(result.source).toContain('note under done');
			expect(result.source).not.toContain('- [ ] Open child');

			// Target gets only the open child
			expect(result.target).toContain('- [ ] Parent task');
			expect(result.target).toContain('- [ ] Open child');
			expect(result.target).not.toContain('Done child');
			expect(result.target).not.toContain('note under done');
		});

		it('should preserve indentation of children in target', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task
  - Level 1
    - Level 2
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				cursorLine: 0
			});

			// Target should preserve relative indentation
			expect(result.target).toMatch(/- \[ \] Task\n\s+- Level 1\n\s+- Level 2/);
		});
	});

	describe('Log heading management', () => {
		it('should create ## Todo heading if not present', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `
# Daily Note

Some content
`,
				cursorLine: 0
			});

			expect(result.target).toContain('## Todo');
			expect(result.target).toContain('- [ ] Task');
		});

		it('should add task under existing ## Log heading', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] New task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `
## Log
- [ ] Existing task
`,
				cursorLine: 0
			});

			expect(result.target).toContain('## Log');
			expect(result.target).toContain('- [ ] Existing task');
			expect(result.target).toContain('- [ ] New task');
		});

		it('should place ## Todo after frontmatter', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `---
title: Note
---

# Heading
`,
				cursorLine: 0
			});

			// Todo heading should come after frontmatter
			const frontmatterEnd = result.target!.indexOf('---', 3);
			const todoPos = result.target!.indexOf('## Todo');
			expect(todoPos).toBeGreaterThan(frontmatterEnd);
		});
	});

	describe('boundary transitions', () => {
		it('should migrate task from Sunday to next weekly note', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Sunday task
`,
				sourceFileName: '2026-01-18 Sun', // Sunday
				targetContent: '',
				cursorLine: 0
			});

			// Should target next weekly note
			expect(result.targetPath).toMatch(/W04/);
			expect(result.source).toContain('- [>] Sunday task');
			expect(result.target).toContain('- [ ] Sunday task');
		});

		it('should migrate task from December monthly to next yearly note', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] December task
`,
				sourceFileName: '2026-12 Dec',
				targetContent: '',
				cursorLine: 0
			});

			// Should target next yearly note
			expect(result.targetPath).toContain('2027/2027');
			expect(result.source).toContain('- [>] December task');
			expect(result.target).toContain('- [ ] December task');
		});
	});

	describe('multi-select migration', () => {
		it('should migrate multiple top-level tasks when selected', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task A
- [ ] Task B
- [ ] Task C
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			// Source should have all selected tasks marked as migrated
			expect(result.source).toContain('- [>] Task A');
			expect(result.source).toContain('- [>] Task B');
			expect(result.source).toContain('- [>] Task C');

			// Target should have all tasks
			expect(result.target).toContain('- [ ] Task A');
			expect(result.target).toContain('- [ ] Task B');
			expect(result.target).toContain('- [ ] Task C');
		});

		it('should only migrate top-level tasks, not children', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task A
  - [ ] Child of A
- [ ] Task B
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			// Source: Task A and B migrated, child removed with parent
			expect(result.source).toContain('- [>] Task A');
			expect(result.source).toContain('- [>] Task B');
			expect(result.source).not.toContain('Child of A');

			// Target: Both tasks with their children
			expect(result.target).toContain('- [ ] Task A');
			expect(result.target).toContain('Child of A');
			expect(result.target).toContain('- [ ] Task B');
		});

		it('should skip non-task lines in selection', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task A
- Just a note
- [x] Completed task
- [ ] Task B
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				selectionStartLine: 0,
				selectionEndLine: 3
			});

			// Only incomplete tasks should be migrated
			expect(result.source).toContain('- [>] Task A');
			expect(result.source).toContain('- Just a note'); // unchanged
			expect(result.source).toContain('- [x] Completed task'); // unchanged
			expect(result.source).toContain('- [>] Task B');

			// Target should only have incomplete tasks
			expect(result.target).toContain('- [ ] Task A');
			expect(result.target).toContain('- [ ] Task B');
			expect(result.target).not.toContain('Just a note');
			expect(result.target).not.toContain('Completed task');
		});

		it('should handle partial line selection', async () => {
			// Even if selection starts/ends mid-line, include those lines
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task A
- [ ] Task B
- [ ] Task C
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				selectionStartLine: 0,
				selectionEndLine: 1 // Only lines 0 and 1
			});

			// Tasks A and B should be migrated
			expect(result.source).toContain('- [>] Task A');
			expect(result.source).toContain('- [>] Task B');
			expect(result.source).toContain('- [ ] Task C'); // not selected

			expect(result.target).toContain('- [ ] Task A');
			expect(result.target).toContain('- [ ] Task B');
			expect(result.target).not.toContain('Task C');
		});

		it('should preserve original order of tasks in target', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] First task
- [ ] Second task
- [ ] Third task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				selectionStartLine: 0,
				selectionEndLine: 2
			});

			// Tasks should appear in original order (First, Second, Third)
			const firstIdx = result.target!.indexOf('First task');
			const secondIdx = result.target!.indexOf('Second task');
			const thirdIdx = result.target!.indexOf('Third task');

			expect(firstIdx).toBeGreaterThan(-1);
			expect(secondIdx).toBeGreaterThan(firstIdx);
			expect(thirdIdx).toBeGreaterThan(secondIdx);
		});

		it('should preserve original order with children in target', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] First task
  - First child
- [ ] Second task
  - Second child
- [ ] Third task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				selectionStartLine: 0,
				selectionEndLine: 4
			});

			// Tasks and children should appear in original order
			const firstIdx = result.target!.indexOf('First task');
			const firstChildIdx = result.target!.indexOf('First child');
			const secondIdx = result.target!.indexOf('Second task');
			const secondChildIdx = result.target!.indexOf('Second child');
			const thirdIdx = result.target!.indexOf('Third task');

			expect(firstIdx).toBeGreaterThan(-1);
			expect(firstChildIdx).toBeGreaterThan(firstIdx);
			expect(secondIdx).toBeGreaterThan(firstChildIdx);
			expect(secondChildIdx).toBeGreaterThan(secondIdx);
			expect(thirdIdx).toBeGreaterThan(secondChildIdx);
		});

		it('should fall back to single task when no selection', async () => {
			// No selectionStartLine/selectionEndLine = use cursorLine behavior
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task A
- [ ] Task B
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				cursorLine: 0
				// no selection params
			});

			// Only Task A should be migrated
			expect(result.source).toContain('- [>] Task A');
			expect(result.source).toContain('- [ ] Task B'); // unchanged

			expect(result.target).toContain('- [ ] Task A');
			expect(result.target).not.toContain('Task B');
		});
	});

	describe('transactional safety', () => {
		it('leaves the source untouched when the target write fails', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task to migrate
  - Child note
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				cursorLine: 0,
				failTargetWrite: true
			});

			expect(result.source).toContain('- [ ] Task to migrate');
			expect(result.source).toContain('- Child note');
			expect(result.source).not.toContain('[>]');
			expect(result.notice).toMatch(/error/i);
		});
	});


	describe('project context', () => {
		it('prepends the project link when the task sits under a project bullet', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [[Migration Initiative]]
  - [ ] Write runbook
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				cursorLine: 1,
				projects: ['Migration Initiative']
			});

			// Source: nested task marked migrated, line text unchanged otherwise
			expect(result.source).toContain('- [>] Write runbook');

			// Target: project context restored via prepended link
			expect(result.target).toContain('- [ ] [[Migration Initiative]] Write runbook');
		});

		it('does not prepend when the link is already on the task line', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Write runbook
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				cursorLine: 0,
				projects: ['Migration Initiative']
			});

			expect(result.target).toContain('- [ ] [[Migration Initiative]] Write runbook');
			expect(result.target).not.toContain('[[Migration Initiative]] [[Migration Initiative]]');
		});

		it('does not prepend for non-project ancestor bullets', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [[Some Random Note]]
  - [ ] Unrelated task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				cursorLine: 1,
				projects: []
			});

			expect(result.target).toContain('- [ ] Unrelated task');
			expect(result.target).not.toContain('[[Some Random Note]] Unrelated task');
		});
	});


	describe('note locations from Periodic Notes', () => {
		it('resolves folder and format from the Periodic Notes settings', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Task to migrate
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: '',
				cursorLine: 0,
				diaryFolder: 'Journal'
			});

			expect(result.targetPath).toContain('Journal/');
			expect(result.target).toContain('- [ ] Task to migrate');
			expect(result.source).toContain('- [>] Task to migrate');
		});
	});

	describe('project-aware insertion', () => {
		it('daily→daily never groups, even next to an existing collector', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] New task
`,
				sourceFileName: '2026-01-22 Thu', // migrates to next daily
				targetContent: `
## Todo
- [ ] Push [[Migration Initiative]]
	- [ ] other task
`,
				cursorLine: 0,
				projects: ['Migration Initiative']
			});

			const lines = result.target!.split('\n');
			expect(lines).toContain('- [ ] [[Migration Initiative]] New task');
			expect(lines).not.toContain('\t- [ ] New task');
			expect(result.source).toContain('- [>] [[Migration Initiative]] New task');
		});

		it('daily→weekly (last day of the week) consolidates under a new collector', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] New goal
`,
				sourceFileName: '2026-01-18 Sun', // last day of the week, migrates to weekly
				targetContent: `
## Todo
- [ ] [[Migration Initiative|MI]] Existing goal
`,
				cursorLine: 0,
				projects: ['Migration Initiative']
			});

			const lines = result.target!.split('\n');
			const collectorIdx = lines.indexOf('- [ ] Push [[Migration Initiative|MI]]');
			expect(collectorIdx).toBeGreaterThan(-1);
			expect(lines[collectorIdx + 1]).toBe('\t- [ ] Existing goal');
			expect(lines[collectorIdx + 2]).toBe('\t- [ ] New goal');
		});

		it('merges a project task with an existing copy instead of duplicating', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] [[Migration Initiative]] Draft plan
	- new note
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `
## Todo
- [<] [[Migration Initiative]] Draft plan
`,
				cursorLine: 0,
				projects: ['Migration Initiative']
			});

			expect(result.target!.match(/Draft plan/g)).toHaveLength(1);
			expect(result.target).toContain('- [ ] [[Migration Initiative]] Draft plan');
			expect(result.target).toContain('- new note');
		});

		it('a non-project task still duplicates when it already exists in the target (no dedup)', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Recurring task
`,
				sourceFileName: '2026-01-22 Thu',
				targetContent: `
## Todo
- [ ] Recurring task
`,
				cursorLine: 0
			});

			expect(result.target!.match(/Recurring task/g)).toHaveLength(2);
		});
	});

	describe('selecting the collector line itself', () => {
		it('decomposes children so a live target copy reopens instead of duplicating', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Push [[Migration Initiative]]
	- [ ] Storyline sketchen
`,
				sourceFileName: '2026-01-W04', // weekly → always migrates to next weekly (grouping enabled)
				targetContent: `
## Todo
- [ ] Push [[Migration Initiative]]
	- [<] Storyline sketchen
`,
				cursorLine: 0, // the collector line itself
				projects: ['Migration Initiative']
			});

			expect(result.target!.match(/Storyline sketchen/g)).toHaveLength(1);
			expect(result.target).not.toContain('[<]');
			expect(result.target).toContain('\t- [ ] Storyline sketchen');
			// Source: collector migrated, moved task child removed
			expect(result.source).toContain('- [>] Push [[Migration Initiative]]');
			expect(result.source).not.toContain('Storyline sketchen');
		});

		it('leaves a non-task child in the source while moving task children', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Push [[Migration Initiative]]
	- [ ] Storyline sketchen
	- a stray note directly under the collector
`,
				sourceFileName: '2026-01-W04',
				targetContent: '## Todo',
				cursorLine: 0,
				projects: ['Migration Initiative']
			});

			expect(result.target).toContain('- [ ] [[Migration Initiative]] Storyline sketchen');
			expect(result.source).toContain('- [>] Push [[Migration Initiative]]');
			expect(result.source).toContain('a stray note directly under the collector');
			expect(result.source).not.toContain('Storyline sketchen');
		});

		it('falls back to a plain transfer when the collector link does not resolve to a project note', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Push [[Missing Note]]
	- [ ] Storyline sketchen
`,
				sourceFileName: '2026-01-W04',
				targetContent: '## Todo',
				cursorLine: 0,
				projects: []
			});

			expect(result.target).toContain('- [ ] Push [[Missing Note]]');
			expect(result.target).toContain('\t- [ ] Storyline sketchen');
			expect(result.source).toContain('- [>] Push [[Missing Note]]');
		});

		it('multi-select of a collector\'s own children migrates each as its own project task', async () => {
			const result = await testMigrateTaskPlugin({
				source: `
- [ ] Push [[Migration Initiative|MI]]
	- [ ] Storyline sketchen
	- [ ] Draft plan
`,
				sourceFileName: '2026-01-W04',
				targetContent: '## Todo',
				selectionStartLine: 1,
				selectionEndLine: 2,
				projects: ['Migration Initiative']
			});

			// Both project tasks recognized via the source collector ancestor;
			// grouped under a fresh collector in the target (multi-task insert)
			expect(result.notice).not.toMatch(/no incomplete tasks/i);
			expect(result.target).toContain('- [ ] Push [[Migration Initiative|MI]]');
			expect(result.target).toContain('\t- [ ] Storyline sketchen');
			expect(result.target).toContain('\t- [ ] Draft plan');
			expect(result.source).toContain('- [ ] Push [[Migration Initiative|MI]]');
			expect(result.source).toContain('- [>] Storyline sketchen');
			expect(result.source).toContain('- [>] Draft plan');
		});
	});

});
