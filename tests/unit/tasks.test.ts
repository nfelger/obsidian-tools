import { describe, it, expect } from 'vitest';
import {
	isIncompleteTask,
	dedentLinesByAmount,
	findSectionRange,
	findSliceRange,
	insertUnderTargetHeading,
	insertBlockAfterHeading,
	insertUnderSubheading,
	findTaskBlockEnd,
	findTopLevelTasksInRange,
	markTaskAsScheduled,
	markScheduledAsOpen,
	extractTaskText,
	findTaskMatch,
	insertChildrenUnderTask,
	buildTaskContent,
	prepareTaskContentForTarget,
	insertMultipleTasksWithDeduplication,
	selectTransferableChildLines,
	TaskMarker,
	TaskState
} from '../../src/utils/tasks';
import { parseMarkdownToListItems } from '../helpers/markdownParser.js';
import { createMockEditor } from '../mocks/obsidian.js';

describe('isIncompleteTask', () => {
	it('detects open tasks', () => {
		expect(isIncompleteTask('- [ ] Task')).toBe(true);
		expect(isIncompleteTask('  - [ ] Indented task')).toBe(true);
		expect(isIncompleteTask('\t- [ ] Tab-indented task')).toBe(true);
	});

	it('detects started tasks', () => {
		expect(isIncompleteTask('- [/] Started task')).toBe(true);
		expect(isIncompleteTask('  - [/] Indented started task')).toBe(true);
	});

	it('rejects completed tasks', () => {
		expect(isIncompleteTask('- [x] Completed task')).toBe(false);
		expect(isIncompleteTask('- [X] Completed task uppercase')).toBe(false);
	});

	it('rejects migrated tasks', () => {
		expect(isIncompleteTask('- [>] Migrated task')).toBe(false);
	});

	it('rejects non-task items', () => {
		expect(isIncompleteTask('- Regular bullet')).toBe(false);
		expect(isIncompleteTask('Just text')).toBe(false);
		expect(isIncompleteTask('# Heading')).toBe(false);
	});

	it('rejects invalid task syntax', () => {
		expect(isIncompleteTask('- []Task')).toBe(false); // No space after ]
		expect(isIncompleteTask('- [ Task')).toBe(false); // Missing ]
		expect(isIncompleteTask('-[ ] Task')).toBe(false); // Missing space after -
	});
});

describe('dedentLinesByAmount', () => {
	it('removes specified amount of indentation', () => {
		const lines = [
			'    Line 1',
			'    Line 2',
			'        Nested line'
		];
		const result = dedentLinesByAmount(lines, 4);
		expect(result).toEqual([
			'Line 1',
			'Line 2',
			'    Nested line'
		]);
	});

	it('preserves relative indentation', () => {
		const lines = [
			'  - Item',
			'    - Nested'
		];
		const result = dedentLinesByAmount(lines, 2);
		expect(result).toEqual([
			'- Item',
			'  - Nested'
		]);
	});

	it('handles lines with less indentation than amount', () => {
		const lines = [
			'  Short indent',
			'    More indent'
		];
		const result = dedentLinesByAmount(lines, 4);
		expect(result).toEqual([
			'Short indent',
			'More indent'
		]);
	});

	it('preserves empty lines', () => {
		const lines = [
			'    Line 1',
			'',
			'    Line 2'
		];
		const result = dedentLinesByAmount(lines, 4);
		expect(result).toEqual([
			'Line 1',
			'',
			'Line 2'
		]);
	});

	it('returns copy when amount is 0', () => {
		const lines = ['  Line'];
		const result = dedentLinesByAmount(lines, 0);
		expect(result).toEqual(lines);
		expect(result).not.toBe(lines); // Different array
	});

	it('returns copy when lines are empty', () => {
		expect(dedentLinesByAmount([], 4)).toEqual([]);
	});
});

describe('findSectionRange', () => {
	it('finds a section and returns start and end', () => {
		const lines = [
			'# Note',
			'',
			'## Log',
			'',
			'- Item 1',
			'',
			'## Other',
			'',
			'Content'
		];
		const result = findSectionRange(lines, '## Log');
		expect(result).toEqual({ start: 2, end: 6 });
	});

	it('returns null when heading not found', () => {
		const lines = ['# Note', '', 'Content'];
		expect(findSectionRange(lines, '## Log')).toBeNull();
	});

	it('finds headings containing regex special characters', () => {
		const lines = [
			'## Todo (work)',
			'- [ ] a',
			'',
			'## Log',
			'- b'
		];
		const result = findSectionRange(lines, '## Todo (work)');
		expect(result).toEqual({ start: 0, end: 3 });
	});

	it('does not treat special characters as regex syntax', () => {
		// "C++" as a literal must not match "C" (the "+" must not quantify)
		const lines = ['## C', '- x'];
		expect(findSectionRange(lines, '## C++')).toBeNull();
	});

	it('extends to end of file when no subsequent heading', () => {
		const lines = [
			'## Log',
			'',
			'- Item 1',
			'- Item 2'
		];
		const result = findSectionRange(lines, '## Log');
		expect(result).toEqual({ start: 0, end: 4 });
	});

	it('stops at same-level heading', () => {
		const lines = [
			'## Log',
			'- Item',
			'## Todo',
			'- Task'
		];
		const result = findSectionRange(lines, '## Log');
		expect(result).toEqual({ start: 0, end: 2 });
	});

	it('stops at higher-level heading', () => {
		const lines = [
			'## Log',
			'- Item',
			'# Top Level'
		];
		const result = findSectionRange(lines, '## Log');
		expect(result).toEqual({ start: 0, end: 2 });
	});

	it('does not stop at deeper heading within section', () => {
		const lines = [
			'## Log',
			'- Item',
			'### Subsection',
			'Sub content',
			'## Next'
		];
		const result = findSectionRange(lines, '## Log');
		expect(result).toEqual({ start: 0, end: 4 });
	});

	it('handles heading with trailing whitespace', () => {
		const lines = ['## Log   ', '- Item'];
		const result = findSectionRange(lines, '## Log');
		expect(result).toEqual({ start: 0, end: 2 });
	});

	it('handles empty section (just heading)', () => {
		const lines = [
			'## Log',
			'## Next'
		];
		const result = findSectionRange(lines, '## Log');
		expect(result).toEqual({ start: 0, end: 1 });
	});

	it('works with different heading levels', () => {
		const lines = [
			'# Title',
			'### Deep',
			'Content',
			'### Another'
		];
		const result = findSectionRange(lines, '### Deep');
		expect(result).toEqual({ start: 1, end: 3 });
	});
});

describe('findSliceRange', () => {
	const lines = `
## Todo
- [ ] a
### Later
- [ ] b
- [ ] c
### Someday
- [ ] d
## Log
`.trim().split('\n');
	// 0:## Todo 1:a 2:### Later 3:b 4:c 5:### Someday 6:d 7:## Log
	const section = { start: 0, end: 7 };

	it('bounds a line before any sub-heading by the section itself', () => {
		expect(findSliceRange(lines, section, 1)).toEqual({ start: 0, end: 2 });
	});

	it('bounds a line between sub-headings by both', () => {
		expect(findSliceRange(lines, section, 3)).toEqual({ start: 2, end: 5 });
		expect(findSliceRange(lines, section, 4)).toEqual({ start: 2, end: 5 });
	});

	it('bounds the last slice by the section end', () => {
		expect(findSliceRange(lines, section, 6)).toEqual({ start: 5, end: 7 });
	});
});

describe('insertUnderTargetHeading', () => {
	it('appends at end of existing ## Log section', () => {
		const content = `# Note

## Log

Existing content`;
		const result = insertUnderTargetHeading(content, '- New task', '## Log');
		expect(result).toContain('## Log\n\nExisting content\n- New task');
	});

	it('creates ## Log heading if missing', () => {
		const content = `# Note

Some content`;
		const result = insertUnderTargetHeading(content, '- New task', '## Log');
		expect(result).toContain('## Log\n- New task');
	});

	it('inserts after frontmatter when creating heading', () => {
		const content = `---
title: Note
---

Some content`;
		const result = insertUnderTargetHeading(content, '- New task', '## Log');
		const lines = result.split('\n');
		expect(lines[0]).toBe('---');
		expect(lines[1]).toBe('title: Note');
		expect(lines[2]).toBe('---');
		expect(lines[3]).toBe('## Log');
		expect(lines[4]).toBe('- New task');
	});

	it('inserts at top of empty file', () => {
		const content = '';
		const result = insertUnderTargetHeading(content, '- New task', '## Log');
		expect(result.trim()).toBe('## Log\n- New task');
	});

	it('handles multiple insertions in chronological order', () => {
		let content = '# Note\n\nSome content';
		content = insertUnderTargetHeading(content, '- Task 1', '## Log');
		content = insertUnderTargetHeading(content, '- Task 2', '## Log');

		const lines = content.split('\n');
		const logIdx = lines.findIndex(l => l === '## Log');
		expect(lines[logIdx + 1]).toBe('- Task 1');
		expect(lines[logIdx + 2]).toBe('- Task 2');
	});

	it('appends before the next same-level heading', () => {
		const content = `## Log

- Existing task

## Other Section

Other content`;
		const result = insertUnderTargetHeading(content, '- New task', '## Log');
		const lines = result.split('\n');
		const logIdx = lines.findIndex(l => l === '## Log');
		const otherIdx = lines.findIndex(l => l === '## Other Section');

		// New task should be between Log content and Other Section
		const newTaskIdx = lines.findIndex(l => l === '- New task');
		expect(newTaskIdx).toBeGreaterThan(logIdx);
		expect(newTaskIdx).toBeLessThan(otherIdx);
		// Existing task stays before new task
		const existingIdx = lines.findIndex(l => l === '- Existing task');
		expect(existingIdx).toBeLessThan(newTaskIdx);
	});

	it('appends before a higher-level heading', () => {
		const content = `## Log

- Existing task

# Top Level Heading`;
		const result = insertUnderTargetHeading(content, '- New task', '## Log');
		const lines = result.split('\n');
		const topIdx = lines.findIndex(l => l === '# Top Level Heading');
		const newTaskIdx = lines.findIndex(l => l === '- New task');

		expect(newTaskIdx).toBeLessThan(topIdx);
	});

	it('does not stop at a deeper heading within the section', () => {
		const content = `## Log

- Existing task

### Subsection

Sub content`;
		const result = insertUnderTargetHeading(content, '- New task', '## Log');
		const lines = result.split('\n');
		const subIdx = lines.findIndex(l => l === '### Subsection');
		const newTaskIdx = lines.findIndex(l => l === '- New task');

		// New task should be appended after subsection content (end of ## Log section)
		expect(newTaskIdx).toBeGreaterThan(subIdx);
	});
});

describe('insertBlockAfterHeading', () => {
	it('inserts the block directly after the heading (reverse-chronological)', () => {
		const content = `## Log

### Older entry

- old note`;
		const result = insertBlockAfterHeading(content, ['', '### New entry', '', '- new note'], '## Log');
		expect(result).toBe(`## Log

### New entry

- new note

### Older entry

- old note`);
	});

	it('creates the heading at the end of the file when missing', () => {
		const content = `## Todo
- [ ] Task`;
		const result = insertBlockAfterHeading(content, ['', '### Entry', '', '- note'], '## Log');
		expect(result).toBe(`## Todo
- [ ] Task

## Log

### Entry

- note`);
	});

	it('re-renders the block in the target indentation unit', () => {
		const content = `## Log
- existing
\t- tab child`;
		const result = insertBlockAfterHeading(content, ['- new', '  - space child'], '## Log');
		expect(result).toContain('\t- space child');
		expect(result).not.toContain('  - space child');
	});

	it('accepts pre-split lines in place of a content string', () => {
		const result = insertBlockAfterHeading(['## Log'], ['- note'], '## Log');
		expect(result).toBe('## Log\n- note');
	});
});

describe('insertUnderSubheading', () => {
	it('appends to the end of an existing sub-section, before its trailing blank line', () => {
		const content = `## Log

### [[2026-07-02 Thu]]

- [x] Earlier completion

### [[2026-07-01 Wed]]

- older entry`;
		const result = insertUnderSubheading(content, ['- [x] New completion'], '## Log', '### [[2026-07-02 Thu]]');
		expect(result).toBe(`## Log

### [[2026-07-02 Thu]]

- [x] Earlier completion
- [x] New completion

### [[2026-07-01 Wed]]

- older entry`);
	});

	it('starts a new sub-section directly after the heading when none exists', () => {
		const content = `## Log

### [[2026-07-01 Wed]]

- older entry`;
		const result = insertUnderSubheading(content, ['- [x] New completion'], '## Log', '### [[2026-07-02 Thu]]');
		expect(result).toBe(`## Log

### [[2026-07-02 Thu]]

- [x] New completion

### [[2026-07-01 Wed]]

- older entry`);
	});

	it('creates the heading at the end of the file when missing', () => {
		const content = `## Todo
- [ ] Task`;
		const result = insertUnderSubheading(content, ['- [x] Done'], '## Log', '### [[2026-07-02 Thu]]');
		expect(result).toBe(`## Todo
- [ ] Task

## Log

### [[2026-07-02 Thu]]

- [x] Done`);
	});

	it('ignores a matching sub-heading outside the target section', () => {
		const content = `## Notes

### [[2026-07-02 Thu]]

- unrelated

## Log`;
		const result = insertUnderSubheading(content, ['- [x] Done'], '## Log', '### [[2026-07-02 Thu]]');
		// The Notes sub-section is untouched; a new sub-section starts under ## Log
		expect(result).toBe(`## Notes

### [[2026-07-02 Thu]]

- unrelated

## Log

### [[2026-07-02 Thu]]

- [x] Done`);
	});

	it('re-renders appended entries in the target indentation unit', () => {
		const content = `## Log

### [[2026-07-02 Thu]]

- [x] Earlier
\t- tab child`;
		const result = insertUnderSubheading(content, ['- [x] New', '  - space child'], '## Log', '### [[2026-07-02 Thu]]');
		expect(result).toContain('\t- space child');
		expect(result).not.toContain('  - space child');
	});
});

describe('findTaskBlockEnd', () => {
	it('returns the line after a childless task', () => {
		const lines = ['- [ ] Task', '- [ ] Next'];
		expect(findTaskBlockEnd(lines, 0)).toBe(1);
	});

	it('includes the more-indented children', () => {
		const lines = ['- [ ] Task', '  - child', '    - grandchild', '- [ ] Next'];
		expect(findTaskBlockEnd(lines, 0)).toBe(3);
	});

	it('keeps blank lines only when a deeper line follows them', () => {
		const lines = ['- [ ] Task', '  - child', '', '  - after blank', '', '- [ ] Next'];
		expect(findTaskBlockEnd(lines, 0)).toBe(4);
	});
});

describe('findTopLevelTasksInRange', () => {
	it('finds all incomplete tasks in range', () => {
		const content = `- [ ] Task A
- [ ] Task B
- [ ] Task C`;
		const editor = createMockEditor({ content });
		const listItems = parseMarkdownToListItems(content);

		const result = findTopLevelTasksInRange(editor, listItems, 0, 2);
		expect(result).toEqual([0, 1, 2]);
	});

	it('excludes tasks outside range', () => {
		const content = `- [ ] Task A
- [ ] Task B
- [ ] Task C
- [ ] Task D`;
		const editor = createMockEditor({ content });
		const listItems = parseMarkdownToListItems(content);

		const result = findTopLevelTasksInRange(editor, listItems, 1, 2);
		expect(result).toEqual([1, 2]);
	});

	it('excludes children of tasks in range', () => {
		const content = `- [ ] Task A
  - [ ] Child of A
- [ ] Task B`;
		const editor = createMockEditor({ content });
		const listItems = parseMarkdownToListItems(content);

		const result = findTopLevelTasksInRange(editor, listItems, 0, 2);
		// Should only include Task A and Task B, not Child of A
		expect(result).toEqual([0, 2]);
	});

	it('excludes completed tasks', () => {
		const content = `- [ ] Task A
- [x] Completed
- [ ] Task B`;
		const editor = createMockEditor({ content });
		const listItems = parseMarkdownToListItems(content);

		const result = findTopLevelTasksInRange(editor, listItems, 0, 2);
		expect(result).toEqual([0, 2]);
	});

	it('excludes plain bullets', () => {
		const content = `- [ ] Task A
- Just a note
- [ ] Task B`;
		const editor = createMockEditor({ content });
		const listItems = parseMarkdownToListItems(content);

		const result = findTopLevelTasksInRange(editor, listItems, 0, 2);
		expect(result).toEqual([0, 2]);
	});

	it('returns empty array if no incomplete tasks in range', () => {
		const content = `- [x] Completed
- Just a note`;
		const editor = createMockEditor({ content });
		const listItems = parseMarkdownToListItems(content);

		const result = findTopLevelTasksInRange(editor, listItems, 0, 1);
		expect(result).toEqual([]);
	});

	it('handles deeply nested children', () => {
		const content = `- [ ] Task A
  - [ ] Child
    - [ ] Grandchild
- [ ] Task B`;
		const editor = createMockEditor({ content });
		const listItems = parseMarkdownToListItems(content);

		const result = findTopLevelTasksInRange(editor, listItems, 0, 3);
		// Only top-level tasks
		expect(result).toEqual([0, 3]);
	});

	it('handles child task whose parent is outside selection', () => {
		const content = `- [ ] Task A
  - [ ] Child of A
- [ ] Task B`;
		const editor = createMockEditor({ content });
		const listItems = parseMarkdownToListItems(content);

		// Select only Child of A and Task B (lines 1-2)
		const result = findTopLevelTasksInRange(editor, listItems, 1, 2);
		// Child of A has parent at line 0 which is outside selection,
		// but it's still a child so should NOT be included as top-level
		// Only Task B should be included
		expect(result).toEqual([2]);
	});
});

describe('markTaskAsScheduled', () => {
	it('marks open task as scheduled', () => {
		const result = markTaskAsScheduled('- [ ] My task');
		expect(result).toBe('- [<] My task');
	});

	it('marks started task as scheduled', () => {
		const result = markTaskAsScheduled('- [/] Started task');
		expect(result).toBe('- [<] Started task');
	});

	it('preserves indentation', () => {
		expect(markTaskAsScheduled('  - [ ] Indented task')).toBe('  - [<] Indented task');
		expect(markTaskAsScheduled('\t- [ ] Tab indented')).toBe('\t- [<] Tab indented');
		expect(markTaskAsScheduled('    - [/] Deep indent')).toBe('    - [<] Deep indent');
	});

	it('preserves task content with special characters', () => {
		const result = markTaskAsScheduled('- [ ] Task with [[link]] and #tag');
		expect(result).toBe('- [<] Task with [[link]] and #tag');
	});

	it('returns line unchanged if not an incomplete task', () => {
		expect(markTaskAsScheduled('- [x] Completed')).toBe('- [x] Completed');
		expect(markTaskAsScheduled('- [>] Migrated')).toBe('- [>] Migrated');
		expect(markTaskAsScheduled('- Regular bullet')).toBe('- Regular bullet');
		expect(markTaskAsScheduled('Just text')).toBe('Just text');
	});
});

// === Deduplication Helpers for pullUp ===

describe('TaskMarker.isScheduled', () => {
	it('detects only scheduled tasks', () => {
		expect(TaskMarker.fromLine('- [<] Scheduled task')?.isScheduled()).toBe(true);
		expect(TaskMarker.fromLine('\t- [<] Tab-indented')?.isScheduled()).toBe(true);
		expect(TaskMarker.fromLine('- [ ] Open task')?.isScheduled()).toBe(false);
		expect(TaskMarker.fromLine('- [/] Started task')?.isScheduled()).toBe(false);
		expect(TaskMarker.fromLine('- [x] Completed task')?.isScheduled()).toBe(false);
		expect(TaskMarker.fromLine('- [>] Migrated task')?.isScheduled()).toBe(false);
	});
});

describe('markScheduledAsOpen', () => {
	it('marks scheduled task as open', () => {
		expect(markScheduledAsOpen('- [<] Scheduled task')).toBe('- [ ] Scheduled task');
	});

	it('preserves indentation', () => {
		expect(markScheduledAsOpen('  - [<] Indented')).toBe('  - [ ] Indented');
		expect(markScheduledAsOpen('\t- [<] Tab indented')).toBe('\t- [ ] Tab indented');
		expect(markScheduledAsOpen('    - [<] Deep indent')).toBe('    - [ ] Deep indent');
	});

	it('preserves task content with special characters', () => {
		expect(markScheduledAsOpen('- [<] Task with [[link]] and #tag'))
			.toBe('- [ ] Task with [[link]] and #tag');
	});

	it('returns line unchanged if not a scheduled task', () => {
		expect(markScheduledAsOpen('- [ ] Open')).toBe('- [ ] Open');
		expect(markScheduledAsOpen('- [/] Started')).toBe('- [/] Started');
		expect(markScheduledAsOpen('- [x] Completed')).toBe('- [x] Completed');
		expect(markScheduledAsOpen('- [>] Migrated')).toBe('- [>] Migrated');
		expect(markScheduledAsOpen('- Regular bullet')).toBe('- Regular bullet');
	});
});

describe('extractTaskText', () => {
	it('extracts text from open task', () => {
		expect(extractTaskText('- [ ] Buy groceries')).toBe('Buy groceries');
	});

	it('extracts text from scheduled task', () => {
		expect(extractTaskText('- [<] Review PR')).toBe('Review PR');
	});

	it('extracts text from started task', () => {
		expect(extractTaskText('- [/] In progress task')).toBe('In progress task');
	});

	it('extracts text from completed task', () => {
		expect(extractTaskText('- [x] Done task')).toBe('Done task');
	});

	it('extracts text from migrated task', () => {
		expect(extractTaskText('- [>] Migrated task')).toBe('Migrated task');
	});

	it('handles indented tasks', () => {
		expect(extractTaskText('  - [ ] Indented task')).toBe('Indented task');
		expect(extractTaskText('\t- [<] Tab indented')).toBe('Tab indented');
		expect(extractTaskText('    - [/] Deep indent')).toBe('Deep indent');
	});

	it('trims whitespace from task text', () => {
		expect(extractTaskText('- [ ]   Padded text  ')).toBe('Padded text');
	});

	it('preserves special characters in text', () => {
		expect(extractTaskText('- [ ] Task with [[link]] and #tag'))
			.toBe('Task with [[link]] and #tag');
	});

	it('returns empty string for non-task items', () => {
		expect(extractTaskText('- Regular bullet')).toBe('');
		expect(extractTaskText('Just text')).toBe('');
		expect(extractTaskText('# Heading')).toBe('');
	});
});

describe('findTaskMatch', () => {
	describe('whole-file search (no heading)', () => {
		it('finds an incomplete task by text', () => {
			const content = `## Log
- [ ] Buy groceries
- [ ] Walk dog`;
			const result = findTaskMatch(content, 'Buy groceries');
			expect(result).toEqual({ lineNumber: 1, state: TaskState.Open });
		});

		it('finds a scheduled task by text', () => {
			const content = `## Log
- [<] Scheduled task
- [ ] Other task`;
			const result = findTaskMatch(content, 'Scheduled task');
			expect(result).toEqual({ lineNumber: 1, state: TaskState.Scheduled });
		});

		it('finds a started task by text', () => {
			const content = `## Log
- [/] Started task`;
			const result = findTaskMatch(content, 'Started task');
			expect(result).toEqual({ lineNumber: 1, state: TaskState.Started });
		});

		it('returns null when task not found', () => {
			const content = `## Log
- [ ] Other task`;
			expect(findTaskMatch(content, 'Missing task')).toBeNull();
		});

		it('returns null for empty task text', () => {
			const content = `## Log
- [ ] Task`;
			expect(findTaskMatch(content, '')).toBeNull();
		});

		it('ignores completed tasks by default', () => {
			const content = `## Log
- [x] Completed task
- [ ] Other task`;
			expect(findTaskMatch(content, 'Completed task')).toBeNull();
		});

		it('falls back to a completed match only when asked and no live copy exists', () => {
			const content = `## Log
- [x] Completed task
- [ ] Other task`;
			const result = findTaskMatch(content, 'Completed task', { includeCompleted: true });
			expect(result).toEqual({ lineNumber: 1, state: TaskState.Completed });
		});

		it('prefers a live match over a completed duplicate', () => {
			const content = `## Log
- [x] Draft rollout plan
- [ ] Draft rollout plan`;
			const result = findTaskMatch(content, 'Draft rollout plan', { includeCompleted: true });
			expect(result).toEqual({ lineNumber: 2, state: TaskState.Open });
		});

		it('ignores migrated tasks', () => {
			const content = `## Log
- [>] Migrated task`;
			expect(findTaskMatch(content, 'Migrated task')).toBeNull();
		});

		it('finds first matching task when duplicates exist', () => {
			const content = `## Log
- [ ] Duplicate task
- Some note
- [ ] Duplicate task`;
			const result = findTaskMatch(content, 'Duplicate task');
			expect(result).toEqual({ lineNumber: 1, state: TaskState.Open });
		});

		it('finds task regardless of indentation', () => {
			const content = `## Log
- [ ] Parent
  - [ ] Indented task`;
			const result = findTaskMatch(content, 'Indented task');
			expect(result).toEqual({ lineNumber: 2, state: TaskState.Open });
		});
	});

	describe('section-scoped search (heading given)', () => {
		const content = `
# Project

## Todo
- [<] Draft rollout plan
- [ ] Write runbook

## Log
- [<] Draft rollout plan
`.trim();

		it('finds a scheduled task inside the section', () => {
			const match = findTaskMatch(content, 'Draft rollout plan', { heading: '## Todo' });
			expect(match).toEqual({ lineNumber: 3, state: TaskState.Scheduled });
		});

		it('finds an open task inside the section', () => {
			const match = findTaskMatch(content, 'Write runbook', { heading: '## Todo' });
			expect(match).toEqual({ lineNumber: 4, state: TaskState.Open });
		});

		it('ignores matches outside the section', () => {
			const match = findTaskMatch(content, 'Write runbook', { heading: '## Log' });
			expect(match).toBeNull();
		});

		it('returns null when the section is missing', () => {
			expect(findTaskMatch('- [ ] Draft rollout plan', 'Draft rollout plan', { heading: '## Todo' })).toBeNull();
		});
	});

	it('accepts pre-split lines in place of a content string', () => {
		const lines = ['## Todo', '- [<] Draft rollout plan'];
		const match = findTaskMatch(lines, 'Draft rollout plan', { heading: '## Todo' });
		expect(match).toEqual({ lineNumber: 1, state: TaskState.Scheduled });
	});
});

describe('insertChildrenUnderTask', () => {
	it('inserts children after task with no existing children', () => {
		const content = `## Log
- [ ] Parent task
- [ ] Other task`;
		const result = insertChildrenUnderTask(content, 1, '  - Child item');
		expect(result).toBe(`## Log
- [ ] Parent task
  - Child item
- [ ] Other task`);
	});

	it('inserts children after existing children', () => {
		const content = `## Log
- [ ] Parent task
  - Existing child
- [ ] Other task`;
		const result = insertChildrenUnderTask(content, 1, '  - New child');
		expect(result).toBe(`## Log
- [ ] Parent task
  - Existing child
  - New child
- [ ] Other task`);
	});

	it('inserts multiple children lines', () => {
		const content = `## Log
- [ ] Parent task
- [ ] Other task`;
		const result = insertChildrenUnderTask(content, 1, '  - Child 1\n  - Child 2');
		expect(result).toBe(`## Log
- [ ] Parent task
  - Child 1
  - Child 2
- [ ] Other task`);
	});

	it('handles task at end of file', () => {
		const content = `## Log
- [ ] Parent task`;
		const result = insertChildrenUnderTask(content, 1, '  - Child item');
		expect(result).toBe(`## Log
- [ ] Parent task
  - Child item`);
	});

	it('handles deeply nested existing children', () => {
		const content = `## Log
- [ ] Parent task
  - Child
    - Grandchild
- [ ] Other task`;
		const result = insertChildrenUnderTask(content, 1, '  - New child');
		expect(result).toBe(`## Log
- [ ] Parent task
  - Child
    - Grandchild
  - New child
- [ ] Other task`);
	});

	it('returns content unchanged for empty children', () => {
		const content = `## Log
- [ ] Parent task`;
		expect(insertChildrenUnderTask(content, 1, '')).toBe(content);
	});

	it('returns content unchanged for invalid line number', () => {
		const content = `## Log
- [ ] Parent task`;
		expect(insertChildrenUnderTask(content, -1, '  - Child')).toBe(content);
		expect(insertChildrenUnderTask(content, 10, '  - Child')).toBe(content);
	});

	it('handles empty lines within children block', () => {
		const content = `## Log
- [ ] Parent task
  - Existing child

  - Child after empty
- [ ] Other task`;
		const result = insertChildrenUnderTask(content, 1, '  - New child');
		expect(result).toBe(`## Log
- [ ] Parent task
  - Existing child

  - Child after empty
  - New child
- [ ] Other task`);
	});
});

// === TaskMarker ===

describe('TaskMarker', () => {
	describe('fromLine', () => {
		it('parses open task', () => {
			const marker = TaskMarker.fromLine('- [ ] Task');
			expect(marker?.state).toBe(TaskState.Open);
		});

		it('parses started task', () => {
			const marker = TaskMarker.fromLine('- [/] Task');
			expect(marker?.state).toBe(TaskState.Started);
		});

		it('parses completed task', () => {
			const marker = TaskMarker.fromLine('- [x] Task');
			expect(marker?.state).toBe(TaskState.Completed);
		});

		it('parses migrated task', () => {
			const marker = TaskMarker.fromLine('- [>] Task');
			expect(marker?.state).toBe(TaskState.Migrated);
		});

		it('parses scheduled task', () => {
			const marker = TaskMarker.fromLine('- [<] Task');
			expect(marker?.state).toBe(TaskState.Scheduled);
		});

		it('handles indented tasks', () => {
			const marker = TaskMarker.fromLine('  - [ ] Task');
			expect(marker?.state).toBe(TaskState.Open);
		});

		it('returns null for non-tasks', () => {
			expect(TaskMarker.fromLine('- Regular bullet')).toBeNull();
			expect(TaskMarker.fromLine('Just text')).toBeNull();
			expect(TaskMarker.fromLine('# Heading')).toBeNull();
		});
	});

	describe('applyToLine', () => {
		it('replaces marker on open task', () => {
			const marker = new TaskMarker(TaskState.Migrated);
			expect(marker.applyToLine('- [ ] Task')).toBe('- [>] Task');
		});

		it('replaces marker on started task', () => {
			const marker = new TaskMarker(TaskState.Open);
			expect(marker.applyToLine('- [/] Task')).toBe('- [ ] Task');
		});

		it('preserves indentation', () => {
			const marker = new TaskMarker(TaskState.Scheduled);
			expect(marker.applyToLine('  - [ ] Task')).toBe('  - [<] Task');
		});

		it('marks any task state as completed', () => {
			const marker = new TaskMarker(TaskState.Completed);
			expect(marker.applyToLine('- [<] Task')).toBe('- [x] Task');
			expect(marker.applyToLine('- [/] Task')).toBe('- [x] Task');
		});
	});

	describe('prependToContent', () => {
		it('prepends text after the checkbox', () => {
			const result = TaskMarker.prependToContent('- [ ] Task text', '[[Project]]');
			expect(result).toBe('- [ ] [[Project]] Task text');
		});

		it('works with started tasks', () => {
			const result = TaskMarker.prependToContent('- [/] Task text', '[[Project]]');
			expect(result).toBe('- [/] [[Project]] Task text');
		});

		it('works with indented tasks', () => {
			const result = TaskMarker.prependToContent('  - [ ] Task text', '[[Project]]');
			expect(result).toBe('  - [ ] [[Project]] Task text');
		});
	});

	describe('stripProjectLink', () => {
		it('strips project link from task line', () => {
			const result = TaskMarker.stripProjectLink('- [ ] [[MyProject]] Task text', 'MyProject');
			expect(result).toBe('- [ ] Task text');
		});

		it('handles different task states', () => {
			expect(TaskMarker.stripProjectLink('- [/] [[Proj]] Do thing', 'Proj'))
				.toBe('- [/] Do thing');
			expect(TaskMarker.stripProjectLink('- [<] [[Proj]] Do thing', 'Proj'))
				.toBe('- [<] Do thing');
		});

		it('strips aliased project links', () => {
			const result = TaskMarker.stripProjectLink('- [ ] [[MyProject|MP]] Task text', 'MyProject');
			expect(result).toBe('- [ ] Task text');
		});

		it('leaves line unchanged when no project link present', () => {
			const result = TaskMarker.stripProjectLink('- [ ] Task without link', 'MyProject');
			expect(result).toBe('- [ ] Task without link');
		});

		it('handles project names with special regex characters', () => {
			const result = TaskMarker.stripProjectLink('- [ ] [[My (Project)]] Task', 'My (Project)');
			expect(result).toBe('- [ ] Task');
		});
	});
});

describe('buildTaskContent', () => {
	it('returns task line alone when no children', () => {
		expect(buildTaskContent('- [ ] Task', [])).toBe('- [ ] Task');
	});

	it('joins children preserving their relative indentation', () => {
		const result = buildTaskContent('- [ ] Task', ['  - Child one', '    - Grandchild']);
		expect(result).toBe('- [ ] Task\n  - Child one\n    - Grandchild');
	});

	it('preserves tab-indented children without adding spaces', () => {
		const result = buildTaskContent('- [ ] Task', ['\t- Child', '\t\t- Grandchild']);
		expect(result).toBe('- [ ] Task\n\t- Child\n\t\t- Grandchild');
	});

	it('preserves empty child lines', () => {
		const result = buildTaskContent('- [ ] Task', ['  - Child', '']);
		expect(result).toBe('- [ ] Task\n  - Child\n');
	});
});

describe('prepareTaskContentForTarget', () => {
	it('strips the source indent and dedents children to match', () => {
		const result = prepareTaskContentForTarget(
			'\t\t- [ ] Task', ['\t\t\t- Child'], { reopenStarted: false }
		);
		expect(result).toEqual({
			taskText: 'Task',
			taskContent: '- [ ] Task\n\t- Child',
			childrenContent: '\t- Child',
			lineForTarget: '- [ ] Task'
		});
	});

	it('leaves a started task alone when reopenStarted is false', () => {
		const result = prepareTaskContentForTarget('- [/] Task', [], { reopenStarted: false });
		expect(result.lineForTarget).toBe('- [/] Task');
		expect(result.taskContent).toBe('- [/] Task');
	});

	it('reopens a started task to [ ] when reopenStarted is true', () => {
		const result = prepareTaskContentForTarget('- [/] Task', [], { reopenStarted: true });
		expect(result.lineForTarget).toBe('- [ ] Task');
		expect(result.taskContent).toBe('- [ ] Task');
	});

	it('leaves an already-open task alone when reopenStarted is true', () => {
		const result = prepareTaskContentForTarget('- [ ] Task', [], { reopenStarted: true });
		expect(result.lineForTarget).toBe('- [ ] Task');
	});

	it('returns an empty childrenContent when there are no children', () => {
		const result = prepareTaskContentForTarget('- [ ] Task', [], { reopenStarted: false });
		expect(result.childrenContent).toBe('');
		expect(result.taskContent).toBe('- [ ] Task');
	});
});

describe('selectTransferableChildLines', () => {
	it('moves everything when no terminal children', () => {
		const lines = ['  - note', '  - [ ] open child', '    - detail'];
		expect(selectTransferableChildLines(lines)).toEqual([true, true, true]);
	});

	it('keeps completed children and their subtrees behind', () => {
		const lines = [
			'  - [x] done child',
			'    - note under done',
			'  - [ ] open child'
		];
		expect(selectTransferableChildLines(lines)).toEqual([false, false, true]);
	});

	it('keeps migrated children behind', () => {
		const lines = ['  - [>] migrated child', '  - note'];
		expect(selectTransferableChildLines(lines)).toEqual([false, true]);
	});

	it('moves open grandchildren under open children', () => {
		const lines = [
			'  - [ ] open child',
			'    - [x] done grandchild',
			'    - [ ] open grandchild'
		];
		expect(selectTransferableChildLines(lines)).toEqual([true, false, true]);
	});

	it('handles tab indentation', () => {
		const lines = ['\t- [x] done', '\t\t- detail', '\t- [ ] open'];
		expect(selectTransferableChildLines(lines)).toEqual([false, false, true]);
	});

	it('keeps blank lines with their surrounding subtree', () => {
		const lines = ['  - [x] done', '', '    - after blank', '  - note'];
		expect(selectTransferableChildLines(lines)).toEqual([false, false, false, true]);
	});
});

describe('insertMultipleTasksWithDeduplication', () => {
	it('converts space-indented children to tabs when target uses tabs', () => {
		const target = `## Todo
- [ ] Existing
\t- existing child
`;
		const result = insertMultipleTasksWithDeduplication(target, [{
			taskText: 'New task',
			taskContent: '- [ ] New task\n  - new child',
			childrenContent: '  - new child'
		}], '## Todo');

		expect(result.newCount).toBe(1);
		expect(result.content).toContain('- [ ] New task\n\t- new child');
	});

	it('indents merged children relative to a nested matched task', () => {
		const target = `## Todo
- [ ] Epic
\t- [<] Review PR
- [ ] Other
`;
		const result = insertMultipleTasksWithDeduplication(target, [{
			taskText: 'Review PR',
			taskContent: '- [ ] Review PR\n  - check tests',
			childrenContent: '  - check tests'
		}], '## Todo');

		expect(result.mergedCount).toBe(1);
		// Reopened and children nested *under* the tab-indented task
		expect(result.content).toContain('\t- [ ] Review PR\n\t\t- check tests');
	});

	it('keeps merged children in the target unit for space-indented targets', () => {
		const target = `## Todo
- [ ] Review PR
  - existing note
`;
		const result = insertMultipleTasksWithDeduplication(target, [{
			taskText: 'Review PR',
			taskContent: '- [ ] Review PR\n\t- new note',
			childrenContent: '\t- new note'
		}], '## Todo');

		expect(result.mergedCount).toBe(1);
		expect(result.content).toContain('- [ ] Review PR\n  - existing note\n  - new note');
	});

	it('preserves the source unit when target has no indentation signal', () => {
		const target = `## Todo
- [ ] Existing
`;
		const result = insertMultipleTasksWithDeduplication(target, [{
			taskText: 'New task',
			taskContent: '- [ ] New task\n\t- child',
			childrenContent: '\t- child'
		}], '## Todo');

		expect(result.content).toContain('- [ ] New task\n\t- child');
	});
});

describe('TaskMarker.replaceContent', () => {
	it('replaces content keeping indent and marker', () => {
		expect(TaskMarker.replaceContent('\t- [/] [[P|x]] Task text', 'Task text')).toBe('\t- [/] Task text');
	});

	it('leaves non-task lines untouched', () => {
		expect(TaskMarker.replaceContent('- just a bullet', 'Other')).toBe('- just a bullet');
	});
});

