import { describe, it, expect } from 'vitest';
import {
	findSectionRange,
	findFirstCompletedTaskInSection,
	findTopLevelAncestor,
	extractTaskBlock,
	findLogInsertionPoint,
	moveCompletedTodoToLog,
	moveAllCompletedTodosToLog
} from '../../src/utils/todoCompletionTracker';
import type { SectionRange } from '../../src/utils/todoCompletionTracker';

describe('findSectionRange', () => {
	it('finds a section heading and its boundaries', () => {
		const lines = [
			'## Todo',
			'- [ ] Task A',
			'- [ ] Task B',
			'## Log',
			'- Did something'
		];

		const range = findSectionRange(lines, '## Todo');
		expect(range).toEqual({
			headingLine: 0,
			contentStart: 1,
			contentEnd: 3
		});
	});

	it('finds a section that extends to end of file', () => {
		const lines = [
			'## Todo',
			'- [ ] Task A',
			'## Log',
			'- Item 1',
			'- Item 2'
		];

		const range = findSectionRange(lines, '## Log');
		expect(range).toEqual({
			headingLine: 2,
			contentStart: 3,
			contentEnd: 5
		});
	});

	it('returns null when heading is not found', () => {
		const lines = ['## Other', '- content'];
		expect(findSectionRange(lines, '## Todo')).toBeNull();
	});

	it('stops at same-level heading', () => {
		const lines = [
			'## Todo',
			'- [ ] Task',
			'## Log',
			'- Item'
		];

		const range = findSectionRange(lines, '## Todo');
		expect(range!.contentEnd).toBe(2);
	});

	it('stops at higher-level heading', () => {
		const lines = [
			'## Todo',
			'- [ ] Task',
			'# Top Level',
			'Content'
		];

		const range = findSectionRange(lines, '## Todo');
		expect(range!.contentEnd).toBe(2);
	});

	it('does not stop at lower-level heading', () => {
		const lines = [
			'## Todo',
			'- [ ] Task',
			'### Subsection',
			'- Sub item',
			'## Log'
		];

		const range = findSectionRange(lines, '## Todo');
		expect(range!.contentEnd).toBe(4);
	});

	it('handles section with blank lines before next heading', () => {
		const lines = [
			'## Todo',
			'- [ ] Task',
			'',
			'## Log'
		];

		const range = findSectionRange(lines, '## Todo');
		expect(range!.contentEnd).toBe(3);
	});
});

describe('findFirstCompletedTaskInSection', () => {
	it('finds a completed task', () => {
		const lines = [
			'## Todo',
			'- [ ] Open task',
			'- [x] Done task',
			'- [ ] Another open'
		];
		const section: SectionRange = { headingLine: 0, contentStart: 1, contentEnd: 4 };

		expect(findFirstCompletedTaskInSection(lines, section)).toBe(2);
	});

	it('finds a completed child task', () => {
		const lines = [
			'## Todo',
			'- [ ] Parent',
			'  - [x] Done child',
			'  - [ ] Open child'
		];
		const section: SectionRange = { headingLine: 0, contentStart: 1, contentEnd: 4 };

		expect(findFirstCompletedTaskInSection(lines, section)).toBe(2);
	});

	it('returns -1 when no completed tasks', () => {
		const lines = [
			'## Todo',
			'- [ ] Open task',
			'- [/] Started task'
		];
		const section: SectionRange = { headingLine: 0, contentStart: 1, contentEnd: 3 };

		expect(findFirstCompletedTaskInSection(lines, section)).toBe(-1);
	});

	it('handles uppercase X', () => {
		const lines = [
			'## Todo',
			'- [X] Done task'
		];
		const section: SectionRange = { headingLine: 0, contentStart: 1, contentEnd: 2 };

		expect(findFirstCompletedTaskInSection(lines, section)).toBe(1);
	});
});

describe('findTopLevelAncestor', () => {
	it('returns the same line for a root-level task', () => {
		const lines = [
			'## Todo',
			'- [x] Root task'
		];

		expect(findTopLevelAncestor(lines, 1, 1)).toBe(1);
	});

	it('walks up to parent from child', () => {
		const lines = [
			'## Todo',
			'- [ ] Parent',
			'  - [x] Child'
		];

		expect(findTopLevelAncestor(lines, 2, 1)).toBe(1);
	});

	it('walks up to grandparent from grandchild', () => {
		const lines = [
			'## Todo',
			'- [ ] Grandparent',
			'  - [ ] Parent',
			'    - [x] Grandchild'
		];

		expect(findTopLevelAncestor(lines, 3, 1)).toBe(1);
	});

	it('stops at blank line boundary', () => {
		const lines = [
			'## Todo',
			'- [ ] First block',
			'',
			'- [ ] Second block',
			'  - [x] Child'
		];

		expect(findTopLevelAncestor(lines, 4, 1)).toBe(3);
	});

	it('does not cross section boundary', () => {
		const lines = [
			'## Todo',
			'- [x] Task'
		];

		expect(findTopLevelAncestor(lines, 1, 1)).toBe(1);
	});

	it('walks past siblings to find less-indented parent', () => {
		const lines = [
			'## Todo',
			'- [ ] Parent',
			'  - [ ] Sibling 1',
			'  - [x] Sibling 2'
		];

		expect(findTopLevelAncestor(lines, 3, 1)).toBe(1);
	});
});

describe('extractTaskBlock', () => {
	it('extracts a single-line task', () => {
		const lines = [
			'## Todo',
			'- [x] Single task',
			'- [ ] Other task'
		];

		const block = extractTaskBlock(lines, 1, 3);
		expect(block.blockLines).toEqual(['- [x] Single task']);
		expect(block.startLine).toBe(1);
		expect(block.endLine).toBe(2);
	});

	it('extracts a task with children', () => {
		const lines = [
			'## Todo',
			'- [ ] Parent',
			'  - [x] Child 1',
			'  - [ ] Child 2',
			'- [ ] Other task'
		];

		const block = extractTaskBlock(lines, 1, 5);
		expect(block.blockLines).toEqual([
			'- [ ] Parent',
			'  - [x] Child 1',
			'  - [ ] Child 2'
		]);
		expect(block.startLine).toBe(1);
		expect(block.endLine).toBe(4);
	});

	it('extracts deeply nested children', () => {
		const lines = [
			'## Todo',
			'- [ ] Root',
			'  - [ ] Level 1',
			'    - [x] Level 2',
			'- [ ] Other'
		];

		const block = extractTaskBlock(lines, 1, 5);
		expect(block.blockLines).toEqual([
			'- [ ] Root',
			'  - [ ] Level 1',
			'    - [x] Level 2'
		]);
	});

	it('stops at blank line', () => {
		const lines = [
			'## Todo',
			'- [x] Task',
			'  - Sub item',
			'',
			'- [ ] Other'
		];

		const block = extractTaskBlock(lines, 1, 5);
		expect(block.blockLines).toEqual([
			'- [x] Task',
			'  - Sub item'
		]);
		expect(block.endLine).toBe(3);
	});

	it('stops at section end', () => {
		const lines = [
			'## Todo',
			'- [x] Task',
			'  - Sub item'
		];

		const block = extractTaskBlock(lines, 1, 3);
		expect(block.blockLines).toEqual([
			'- [x] Task',
			'  - Sub item'
		]);
	});
});

describe('findLogInsertionPoint', () => {
	it('inserts before first blank line among list items', () => {
		const lines = [
			'## Log',
			'- Had meeting',
			'- Reviewed PRs',
			'- Finished report',
			'',
			'- Tomorrow: dentist',
			'- Friday: offsite'
		];
		const section: SectionRange = { headingLine: 0, contentStart: 1, contentEnd: 7 };

		expect(findLogInsertionPoint(lines, section)).toBe(4);
	});

	it('inserts after last list item when no blank line', () => {
		const lines = [
			'## Log',
			'- Item 1',
			'- Item 2',
			'- Item 3'
		];
		const section: SectionRange = { headingLine: 0, contentStart: 1, contentEnd: 4 };

		expect(findLogInsertionPoint(lines, section)).toBe(4);
	});

	it('inserts after heading when log is empty', () => {
		const lines = [
			'## Log',
			'## Next Section'
		];
		const section: SectionRange = { headingLine: 0, contentStart: 1, contentEnd: 1 };

		expect(findLogInsertionPoint(lines, section)).toBe(1);
	});

	it('inserts after heading when log has only blank lines', () => {
		const lines = [
			'## Log',
			'',
			'## Next Section'
		];
		const section: SectionRange = { headingLine: 0, contentStart: 1, contentEnd: 2 };

		expect(findLogInsertionPoint(lines, section)).toBe(1);
	});

	it('skips leading blank line between heading and first list item', () => {
		const lines = [
			'## Log',
			'',
			'- Item 1',
			'- Item 2',
			'',
			'- Future item'
		];
		const section: SectionRange = { headingLine: 0, contentStart: 1, contentEnd: 6 };

		// The blank line at index 1 is before any list items, so it's skipped.
		// The first blank line AFTER list items start is at index 4.
		expect(findLogInsertionPoint(lines, section)).toBe(4);
	});

	it('handles indented list items', () => {
		const lines = [
			'## Log',
			'- Parent item',
			'  - Sub item',
			'',
			'- Future item'
		];
		const section: SectionRange = { headingLine: 0, contentStart: 1, contentEnd: 5 };

		expect(findLogInsertionPoint(lines, section)).toBe(3);
	});
});

describe('moveCompletedTodoToLog', () => {
	it('moves a completed task from Todo to Log', () => {
		const content = `## Todo
- [x] Done task
- [ ] Open task

## Log
- Existing log item`;

		const result = moveCompletedTodoToLog(content);
		expect(result).not.toBeNull();

		const lines = result!.split('\n');
		// Todo should not have the done task
		const todoSection = lines.slice(0, lines.indexOf('## Log'));
		expect(todoSection.join('\n')).not.toContain('[x] Done task');

		// Log should have the done task
		const logSection = lines.slice(lines.indexOf('## Log'));
		expect(logSection.join('\n')).toContain('- [x] Done task');
	});

	it('moves task to correct position (before first blank line in log)', () => {
		const content = `## Todo
- [x] Done task

## Log
- Already happened 1
- Already happened 2

- Future event`;

		const result = moveCompletedTodoToLog(content)!;
		const lines = result.split('\n');
		const logStart = lines.indexOf('## Log');

		// The done task should appear after "Already happened 2" and before the blank line
		const logLines = lines.slice(logStart + 1);
		expect(logLines).toEqual([
			'- Already happened 1',
			'- Already happened 2',
			'- [x] Done task',
			'',
			'- Future event'
		]);
	});

	it('moves entire parent block when child is completed', () => {
		const content = `## Todo
- [ ] Parent task
  - [x] Done child
  - [ ] Open child

## Log
- Existing item`;

		const result = moveCompletedTodoToLog(content)!;
		const lines = result.split('\n');

		// Todo should be empty of tasks
		const todoIdx = lines.indexOf('## Todo');
		const logIdx = lines.indexOf('## Log');
		const todoContent = lines.slice(todoIdx + 1, logIdx).join('\n').trim();
		expect(todoContent).toBe('');

		// Log should have the full block
		expect(result).toContain('- [ ] Parent task');
		expect(result).toContain('  - [x] Done child');
		expect(result).toContain('  - [ ] Open child');
	});

	it('moves deeply nested completion to top-level ancestor', () => {
		const content = `## Todo
- [ ] Grandparent
  - [ ] Parent
    - [x] Done grandchild

## Log
- Existing`;

		const result = moveCompletedTodoToLog(content)!;

		// Entire tree should move
		expect(result).toContain('## Log\n- Existing\n- [ ] Grandparent');
		expect(result).toContain('  - [ ] Parent');
		expect(result).toContain('    - [x] Done grandchild');

		// Todo should be clean
		const todoSection = result.split('## Log')[0];
		expect(todoSection).not.toContain('Grandparent');
	});

	it('returns null when no completed tasks in Todo', () => {
		const content = `## Todo
- [ ] Open task
- [/] Started task

## Log
- Existing`;

		expect(moveCompletedTodoToLog(content)).toBeNull();
	});

	it('returns null when no Todo section exists', () => {
		const content = `## Log
- Existing`;

		expect(moveCompletedTodoToLog(content)).toBeNull();
	});

	it('creates Log section if missing', () => {
		const content = `## Todo
- [x] Done task
- [ ] Open task`;

		const result = moveCompletedTodoToLog(content)!;
		expect(result).toContain('## Log');
		expect(result).toContain('- [x] Done task');
	});

	it('preserves other tasks in Todo', () => {
		const content = `## Todo
- [ ] Keep this
- [x] Move this
- [ ] Keep this too

## Log
- Existing`;

		const result = moveCompletedTodoToLog(content)!;
		expect(result).toContain('- [ ] Keep this');
		expect(result).toContain('- [ ] Keep this too');

		// Both should be in the Todo section
		const todoIdx = result.indexOf('## Todo');
		const logIdx = result.indexOf('## Log');
		const todoContent = result.slice(todoIdx, logIdx);
		expect(todoContent).toContain('- [ ] Keep this');
		expect(todoContent).toContain('- [ ] Keep this too');
	});

	it('inserts at end of log list items when no blank line', () => {
		const content = `## Todo
- [x] Done task

## Log
- Item 1
- Item 2`;

		const result = moveCompletedTodoToLog(content)!;
		const lines = result.split('\n');
		const logStart = lines.indexOf('## Log');
		const logLines = lines.slice(logStart + 1);
		expect(logLines).toEqual([
			'- Item 1',
			'- Item 2',
			'- [x] Done task'
		]);
	});

	it('inserts after heading when log is empty', () => {
		const content = `## Todo
- [x] Done task

## Log`;

		const result = moveCompletedTodoToLog(content)!;
		expect(result).toContain('## Log\n- [x] Done task');
	});

	it('handles Todo after Log in document order', () => {
		const content = `## Log
- Existing item

## Todo
- [x] Done task
- [ ] Open task`;

		const result = moveCompletedTodoToLog(content)!;

		// Done task should move to Log
		const logIdx = result.indexOf('## Log');
		const todoIdx = result.indexOf('## Todo');
		const logSection = result.slice(logIdx, todoIdx);
		expect(logSection).toContain('- [x] Done task');

		// Todo should not have done task
		const todoSection = result.slice(todoIdx);
		expect(todoSection).not.toContain('[x] Done task');
		expect(todoSection).toContain('- [ ] Open task');
	});

	it('does not move [x] tasks that are in Log already', () => {
		const content = `## Todo
- [ ] Open task

## Log
- [x] Already in log`;

		expect(moveCompletedTodoToLog(content)).toBeNull();
	});

	it('handles task with non-task children', () => {
		const content = `## Todo
- [x] Done task
  - Note about this task
  - Another note

## Log
- Existing`;

		const result = moveCompletedTodoToLog(content)!;
		const logIdx = result.indexOf('## Log');
		const logContent = result.slice(logIdx);
		expect(logContent).toContain('- [x] Done task');
		expect(logContent).toContain('  - Note about this task');
		expect(logContent).toContain('  - Another note');
	});
});

describe('moveAllCompletedTodosToLog', () => {
	it('moves multiple completed tasks in one pass', () => {
		const content = `## Todo
- [x] Done task 1
- [ ] Keep this
- [x] Done task 2

## Log
- Existing`;

		const result = moveAllCompletedTodosToLog(content)!;

		// Both done tasks in log
		const logIdx = result.indexOf('## Log');
		const logContent = result.slice(logIdx);
		expect(logContent).toContain('- [x] Done task 1');
		expect(logContent).toContain('- [x] Done task 2');

		// Open task stays in Todo
		const todoIdx = result.indexOf('## Todo');
		const todoContent = result.slice(todoIdx, logIdx);
		expect(todoContent).toContain('- [ ] Keep this');
		expect(todoContent).not.toContain('Done task');
	});

	it('returns null when nothing to move', () => {
		const content = `## Todo
- [ ] Open task

## Log
- Existing`;

		expect(moveAllCompletedTodosToLog(content)).toBeNull();
	});

	it('handles multiple parent blocks from child completions', () => {
		const content = `## Todo
- [ ] Parent A
  - [x] Done child A
- [ ] Parent B
  - [x] Done child B

## Log
- Existing`;

		const result = moveAllCompletedTodosToLog(content)!;

		// Both parent blocks should move
		const logIdx = result.indexOf('## Log');
		const logContent = result.slice(logIdx);
		expect(logContent).toContain('- [ ] Parent A');
		expect(logContent).toContain('  - [x] Done child A');
		expect(logContent).toContain('- [ ] Parent B');
		expect(logContent).toContain('  - [x] Done child B');

		// Todo should be clean
		const todoContent = result.slice(result.indexOf('## Todo'), logIdx);
		expect(todoContent).not.toContain('Parent');
	});

	it('moves blocks with correct insertion order', () => {
		const content = `## Todo
- [x] First done
- [x] Second done

## Log
- Past event

- Future event`;

		const result = moveAllCompletedTodosToLog(content)!;
		const lines = result.split('\n');
		const logStart = lines.indexOf('## Log');
		const logLines = lines.slice(logStart + 1);

		// First done should be inserted before blank line, then second done
		// after that (also before the blank line, which shifts down)
		expect(logLines).toEqual([
			'- Past event',
			'- [x] First done',
			'- [x] Second done',
			'',
			'- Future event'
		]);
	});
});
