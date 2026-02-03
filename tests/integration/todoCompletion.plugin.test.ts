import { describe, it, expect } from 'vitest';
import { testTodoCompletion } from '../helpers/todoCompletionPluginTestHelper';

describe('todoCompletion (integration)', () => {
	describe('basic task completion', () => {
		it('moves a completed task from Todo to Log', async () => {
			const result = await testTodoCompletion({
				content: `
## Todo
- [x] Buy groceries
- [ ] Clean house

## Log
- Had lunch with Alice
`
			});

			expect(result.changed).toBe(true);
			expect(result.content).not.toContain('## Todo\n- [x] Buy groceries');
			expect(result.content).toContain('- [ ] Clean house');
			expect(result.content).toContain('- Had lunch with Alice\n- [x] Buy groceries');
		});

		it('does not trigger for non-daily notes', async () => {
			const result = await testTodoCompletion({
				content: `
## Todo
- [x] Done task

## Log
- Existing
`,
				isDailyNote: false
			});

			expect(result.changed).toBe(false);
		});

		it('does nothing when no completed tasks in Todo', async () => {
			const result = await testTodoCompletion({
				content: `
## Todo
- [ ] Open task
- [/] Started task

## Log
- Existing item
`
			});

			expect(result.changed).toBe(false);
		});

		it('does nothing when no Todo section exists', async () => {
			const result = await testTodoCompletion({
				content: `
## Log
- Existing item
`
			});

			expect(result.changed).toBe(false);
		});
	});

	describe('child completion triggers parent move', () => {
		it('moves entire parent block when child is completed', async () => {
			const result = await testTodoCompletion({
				content: `
## Todo
- [ ] Prepare presentation
  - [x] Write slides
  - [ ] Rehearse

## Log
- Morning standup
`
			});

			expect(result.changed).toBe(true);

			// Entire block moved to Log
			expect(result.content).toContain('- Morning standup');
			expect(result.content).toContain('- [ ] Prepare presentation');
			expect(result.content).toContain('  - [x] Write slides');
			expect(result.content).toContain('  - [ ] Rehearse');

			// Todo should be clean
			const todoIdx = result.content.indexOf('## Todo');
			const logIdx = result.content.indexOf('## Log');
			const todoSection = result.content.slice(todoIdx, logIdx);
			expect(todoSection).not.toContain('Prepare presentation');
		});

		it('moves deeply nested completion to top-level ancestor', async () => {
			const result = await testTodoCompletion({
				content: `
## Todo
- [ ] Project Alpha
  - [ ] Phase 1
    - [x] Task 1.1

## Log
- Existing
`
			});

			expect(result.changed).toBe(true);
			const logIdx = result.content.indexOf('## Log');
			const logContent = result.content.slice(logIdx);
			expect(logContent).toContain('- [ ] Project Alpha');
			expect(logContent).toContain('  - [ ] Phase 1');
			expect(logContent).toContain('    - [x] Task 1.1');
		});
	});

	describe('insertion position in Log', () => {
		it('inserts before blank line separator in Log', async () => {
			const result = await testTodoCompletion({
				content: `
## Todo
- [x] Finished report

## Log
- Had meeting with team
- Reviewed PRs

- Tomorrow: dentist appointment
- Friday: team offsite
`
			});

			expect(result.changed).toBe(true);
			const lines = result.content.split('\n');
			const logStart = lines.indexOf('## Log');
			const logLines = lines.slice(logStart + 1);

			expect(logLines).toEqual([
				'- Had meeting with team',
				'- Reviewed PRs',
				'- [x] Finished report',
				'',
				'- Tomorrow: dentist appointment',
				'- Friday: team offsite'
			]);
		});

		it('appends to end of log when no blank line exists', async () => {
			const result = await testTodoCompletion({
				content: `
## Todo
- [x] Done task

## Log
- Item 1
- Item 2
`
			});

			expect(result.changed).toBe(true);
			const lines = result.content.split('\n');
			const logStart = lines.indexOf('## Log');
			const logLines = lines.slice(logStart + 1);

			expect(logLines).toEqual([
				'- Item 1',
				'- Item 2',
				'- [x] Done task'
			]);
		});

		it('inserts after heading when log is empty', async () => {
			const result = await testTodoCompletion({
				content: `
## Todo
- [x] Done task

## Log
`
			});

			expect(result.changed).toBe(true);
			expect(result.content).toContain('## Log\n- [x] Done task');
		});

		it('creates Log section when missing', async () => {
			const result = await testTodoCompletion({
				content: `
## Todo
- [x] Done task
- [ ] Open task
`
			});

			expect(result.changed).toBe(true);
			expect(result.content).toContain('## Log');
			expect(result.content).toContain('- [x] Done task');
		});
	});

	describe('multiple completed tasks', () => {
		it('moves all completed tasks in one processing cycle', async () => {
			const result = await testTodoCompletion({
				content: `
## Todo
- [x] Done 1
- [ ] Keep this
- [x] Done 2

## Log
- Existing
`
			});

			expect(result.changed).toBe(true);

			// Both done tasks in Log
			const logIdx = result.content.indexOf('## Log');
			const logContent = result.content.slice(logIdx);
			expect(logContent).toContain('- [x] Done 1');
			expect(logContent).toContain('- [x] Done 2');

			// Open task stays in Todo
			const todoIdx = result.content.indexOf('## Todo');
			const todoContent = result.content.slice(todoIdx, logIdx);
			expect(todoContent).toContain('- [ ] Keep this');
		});

		it('moves multiple parent blocks from child completions', async () => {
			const result = await testTodoCompletion({
				content: `
## Todo
- [ ] Parent A
  - [x] Done child A
- [ ] Parent B
  - [x] Done child B

## Log
- Existing
`
			});

			expect(result.changed).toBe(true);

			const logIdx = result.content.indexOf('## Log');
			const logContent = result.content.slice(logIdx);
			expect(logContent).toContain('- [ ] Parent A');
			expect(logContent).toContain('  - [x] Done child A');
			expect(logContent).toContain('- [ ] Parent B');
			expect(logContent).toContain('  - [x] Done child B');
		});
	});

	describe('edge cases', () => {
		it('preserves task block with mixed children (tasks and plain items)', async () => {
			const result = await testTodoCompletion({
				content: `
## Todo
- [x] Research topic
  - Found article on X
  - Key insight: Y
  - [ ] Follow up with Z

## Log
- Morning meeting
`
			});

			expect(result.changed).toBe(true);

			const logIdx = result.content.indexOf('## Log');
			const logContent = result.content.slice(logIdx);
			expect(logContent).toContain('- [x] Research topic');
			expect(logContent).toContain('  - Found article on X');
			expect(logContent).toContain('  - Key insight: Y');
			expect(logContent).toContain('  - [ ] Follow up with Z');
		});

		it('does not move [x] tasks that are already in Log', async () => {
			const result = await testTodoCompletion({
				content: `
## Todo
- [ ] Open task

## Log
- [x] Already completed and logged
`
			});

			expect(result.changed).toBe(false);
		});

		it('handles Todo with only completed tasks (section becomes empty)', async () => {
			const result = await testTodoCompletion({
				content: `
## Todo
- [x] Only task

## Log
- Existing
`
			});

			expect(result.changed).toBe(true);

			const todoIdx = result.content.indexOf('## Todo');
			const logIdx = result.content.indexOf('## Log');
			const todoContent = result.content.slice(todoIdx + '## Todo'.length, logIdx).trim();
			expect(todoContent).toBe('');
		});

		it('handles custom log heading from settings', async () => {
			const result = await testTodoCompletion({
				content: `
## Todo
- [x] Done task

## Journal
- Existing entry
`,
				settings: {
					periodicNoteTaskTargetHeading: '## Journal'
				}
			});

			expect(result.changed).toBe(true);
			const journalIdx = result.content.indexOf('## Journal');
			const journalContent = result.content.slice(journalIdx);
			expect(journalContent).toContain('- [x] Done task');
		});

		it('handles content with frontmatter', async () => {
			const result = await testTodoCompletion({
				content: `
---
date: 2026-02-03
---

## Todo
- [x] Done task

## Log
- Existing
`
			});

			expect(result.changed).toBe(true);
			expect(result.content).toContain('---\ndate: 2026-02-03\n---');

			const logIdx = result.content.indexOf('## Log');
			const logContent = result.content.slice(logIdx);
			expect(logContent).toContain('- [x] Done task');
		});

		it('handles Todo after Log in document order', async () => {
			const result = await testTodoCompletion({
				content: `
## Log
- Existing item

## Todo
- [x] Done task
- [ ] Open task
`
			});

			expect(result.changed).toBe(true);

			const logIdx = result.content.indexOf('## Log');
			const todoIdx = result.content.indexOf('## Todo');
			const logContent = result.content.slice(logIdx, todoIdx);
			expect(logContent).toContain('- [x] Done task');

			const todoContent = result.content.slice(todoIdx);
			expect(todoContent).not.toContain('[x] Done task');
			expect(todoContent).toContain('- [ ] Open task');
		});
	});
});
