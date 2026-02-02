import { describe, it, expect } from 'vitest';
import {
	isIncompleteTask,
	dedentLinesByAmount,
	insertUnderTargetHeading,
	findTopLevelTasksInRange,
	markTaskAsScheduled,
	isScheduledTask,
	markScheduledAsOpen,
	extractTaskText,
	findMatchingTask,
	insertChildrenUnderTask
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

describe('insertUnderTargetHeading', () => {
	it('appends at end of existing ## Log section', () => {
		const content = `# Note

## Log

Existing content`;
		const result = insertUnderTargetHeading(content, '- New task');
		expect(result).toContain('## Log\n\nExisting content\n- New task');
	});

	it('creates ## Log heading if missing', () => {
		const content = `# Note

Some content`;
		const result = insertUnderTargetHeading(content, '- New task');
		expect(result).toContain('## Log\n- New task');
	});

	it('inserts after frontmatter when creating heading', () => {
		const content = `---
title: Note
---

Some content`;
		const result = insertUnderTargetHeading(content, '- New task');
		const lines = result.split('\n');
		expect(lines[0]).toBe('---');
		expect(lines[1]).toBe('title: Note');
		expect(lines[2]).toBe('---');
		expect(lines[3]).toBe('## Log');
		expect(lines[4]).toBe('- New task');
	});

	it('inserts at top of empty file', () => {
		const content = '';
		const result = insertUnderTargetHeading(content, '- New task');
		expect(result.trim()).toBe('## Log\n- New task');
	});

	it('handles multiple insertions in chronological order', () => {
		let content = '# Note\n\nSome content';
		content = insertUnderTargetHeading(content, '- Task 1');
		content = insertUnderTargetHeading(content, '- Task 2');

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
		const result = insertUnderTargetHeading(content, '- New task');
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
		const result = insertUnderTargetHeading(content, '- New task');
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
		const result = insertUnderTargetHeading(content, '- New task');
		const lines = result.split('\n');
		const subIdx = lines.findIndex(l => l === '### Subsection');
		const newTaskIdx = lines.findIndex(l => l === '- New task');

		// New task should be appended after subsection content (end of ## Log section)
		expect(newTaskIdx).toBeGreaterThan(subIdx);
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

describe('isScheduledTask', () => {
	it('detects scheduled tasks', () => {
		expect(isScheduledTask('- [<] Scheduled task')).toBe(true);
		expect(isScheduledTask('  - [<] Indented scheduled')).toBe(true);
		expect(isScheduledTask('\t- [<] Tab-indented')).toBe(true);
	});

	it('rejects open tasks', () => {
		expect(isScheduledTask('- [ ] Open task')).toBe(false);
	});

	it('rejects started tasks', () => {
		expect(isScheduledTask('- [/] Started task')).toBe(false);
	});

	it('rejects completed tasks', () => {
		expect(isScheduledTask('- [x] Completed task')).toBe(false);
	});

	it('rejects migrated tasks', () => {
		expect(isScheduledTask('- [>] Migrated task')).toBe(false);
	});

	it('rejects non-task items', () => {
		expect(isScheduledTask('- Regular bullet')).toBe(false);
		expect(isScheduledTask('Just text')).toBe(false);
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

describe('findMatchingTask', () => {
	it('finds incomplete task by text', () => {
		const content = `## Log
- [ ] Buy groceries
- [ ] Walk dog`;
		const result = findMatchingTask(content, 'Buy groceries');
		expect(result).toEqual({ lineNumber: 1, isScheduled: false });
	});

	it('finds scheduled task by text', () => {
		const content = `## Log
- [<] Scheduled task
- [ ] Other task`;
		const result = findMatchingTask(content, 'Scheduled task');
		expect(result).toEqual({ lineNumber: 1, isScheduled: true });
	});

	it('finds started task by text', () => {
		const content = `## Log
- [/] Started task`;
		const result = findMatchingTask(content, 'Started task');
		expect(result).toEqual({ lineNumber: 1, isScheduled: false });
	});

	it('returns null when task not found', () => {
		const content = `## Log
- [ ] Other task`;
		expect(findMatchingTask(content, 'Missing task')).toBeNull();
	});

	it('returns null for empty task text', () => {
		const content = `## Log
- [ ] Task`;
		expect(findMatchingTask(content, '')).toBeNull();
	});

	it('ignores completed tasks', () => {
		const content = `## Log
- [x] Completed task
- [ ] Other task`;
		// Should not match the completed task
		expect(findMatchingTask(content, 'Completed task')).toBeNull();
	});

	it('ignores migrated tasks', () => {
		const content = `## Log
- [>] Migrated task`;
		expect(findMatchingTask(content, 'Migrated task')).toBeNull();
	});

	it('finds first matching task when duplicates exist', () => {
		const content = `## Log
- [ ] Duplicate task
- Some note
- [ ] Duplicate task`;
		const result = findMatchingTask(content, 'Duplicate task');
		expect(result).toEqual({ lineNumber: 1, isScheduled: false });
	});

	it('finds task regardless of indentation', () => {
		const content = `## Log
- [ ] Parent
  - [ ] Indented task`;
		const result = findMatchingTask(content, 'Indented task');
		expect(result).toEqual({ lineNumber: 2, isScheduled: false });
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
