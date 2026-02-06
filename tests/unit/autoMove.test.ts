import { describe, it, expect } from 'vitest';
import {
	findRootAncestorLine,
	collectBlock,
	findLogInsertionLine,
	computeAutoMove
} from '../../src/utils/autoMove';

describe('findRootAncestorLine', () => {
	it('returns same line for top-level list item', () => {
		const lines = [
			'## Todo',
			'- [x] Task A',
			'- [ ] Task B'
		];
		expect(findRootAncestorLine(lines, 1, 0)).toBe(1);
	});

	it('walks up to parent from a child', () => {
		const lines = [
			'## Todo',
			'- [ ] Parent task',
			'  - [x] Child task',
			'  - [ ] Sibling'
		];
		expect(findRootAncestorLine(lines, 2, 0)).toBe(1);
	});

	it('walks up from deeply nested child to root', () => {
		const lines = [
			'## Todo',
			'- [ ] Root',
			'  - [ ] Child',
			'    - [x] Grandchild'
		];
		expect(findRootAncestorLine(lines, 3, 0)).toBe(1);
	});

	it('stops at section boundary', () => {
		const lines = [
			'## Todo',
			'- [x] Task in Todo'
		];
		expect(findRootAncestorLine(lines, 1, 0)).toBe(1);
	});

	it('handles task that is child of a non-task list item', () => {
		const lines = [
			'## Todo',
			'- Some note',
			'  - [x] Completed child'
		];
		expect(findRootAncestorLine(lines, 2, 0)).toBe(1);
	});

	it('skips blank lines when walking up', () => {
		const lines = [
			'## Todo',
			'- [ ] Parent',
			'',
			'  - [x] Child after blank'
		];
		expect(findRootAncestorLine(lines, 3, 0)).toBe(1);
	});
});

describe('collectBlock', () => {
	it('collects single line with no children', () => {
		const lines = [
			'## Todo',
			'- [x] Task A',
			'- [ ] Task B'
		];
		expect(collectBlock(lines, 1, 3)).toEqual({ startLine: 1, endLine: 2 });
	});

	it('collects task with children', () => {
		const lines = [
			'## Todo',
			'- [ ] Parent',
			'  - [x] Child',
			'  - [ ] Sibling',
			'- [ ] Other'
		];
		expect(collectBlock(lines, 1, 5)).toEqual({ startLine: 1, endLine: 4 });
	});

	it('collects deeply nested children', () => {
		const lines = [
			'## Todo',
			'- [ ] Root',
			'  - [ ] Child',
			'    - [x] Grandchild',
			'    - Notes',
			'- [ ] Other'
		];
		expect(collectBlock(lines, 1, 6)).toEqual({ startLine: 1, endLine: 5 });
	});

	it('stops at section end', () => {
		const lines = [
			'## Todo',
			'- [x] Task',
			'  - Child',
			'## Log'
		];
		expect(collectBlock(lines, 1, 3)).toEqual({ startLine: 1, endLine: 3 });
	});

	it('includes blank lines between children', () => {
		const lines = [
			'## Todo',
			'- [ ] Parent',
			'  - Child 1',
			'',
			'  - Child 2',
			'- [ ] Other'
		];
		expect(collectBlock(lines, 1, 6)).toEqual({ startLine: 1, endLine: 5 });
	});

	it('does not include trailing blank line after block', () => {
		const lines = [
			'## Todo',
			'- [x] Task',
			'',
			'- [ ] Other'
		];
		expect(collectBlock(lines, 1, 4)).toEqual({ startLine: 1, endLine: 2 });
	});
});

describe('findLogInsertionLine', () => {
	it('inserts before first blank line among list items', () => {
		const lines = [
			'## Log',
			'- Done thing',
			'- Another done thing',
			'',
			'- 14:00 Future meeting'
		];
		expect(findLogInsertionLine(lines, 0, 5)).toBe(3);
	});

	it('appends after last list item when no blank line', () => {
		const lines = [
			'## Log',
			'- Item 1',
			'- Item 2'
		];
		expect(findLogInsertionLine(lines, 0, 3)).toBe(3);
	});

	it('inserts after heading in empty section', () => {
		const lines = [
			'## Log',
			'## Next Section'
		];
		expect(findLogInsertionLine(lines, 0, 1)).toBe(1);
	});

	it('inserts after heading when section has only blank lines', () => {
		const lines = [
			'## Log',
			'',
			'## Next'
		];
		expect(findLogInsertionLine(lines, 0, 2)).toBe(1);
	});

	it('handles section at end of file', () => {
		const lines = [
			'## Log',
			'- Item 1',
			'- Item 2'
		];
		expect(findLogInsertionLine(lines, 0, 3)).toBe(3);
	});

	it('finds first blank line, not subsequent ones', () => {
		const lines = [
			'## Log',
			'- Item 1',
			'',
			'- Item 2',
			'',
			'- Item 3'
		];
		expect(findLogInsertionLine(lines, 0, 6)).toBe(2);
	});

	it('handles blank line right after heading with items after', () => {
		const lines = [
			'## Log',
			'',
			'- Future item'
		];
		// The blank line is between heading and list items — insert before the blank
		expect(findLogInsertionLine(lines, 0, 3)).toBe(1);
	});
});

describe('computeAutoMove', () => {
	it('moves a completed root-level task from Todo to Log', () => {
		const doc = [
			'## Todo',
			'- [x] Buy groceries',
			'- [ ] Other task',
			'',
			'## Log',
			'- Did something'
		].join('\n');

		const result = computeAutoMove(doc, 1, '## Todo', '## Log');
		expect(result).not.toBeNull();

		// Apply changes to verify result
		const applied = applyChanges(doc, result!.changes);
		const lines = applied.split('\n');

		// Task should be gone from Todo
		expect(lines).toContain('- [ ] Other task');
		expect(lines.filter(l => l.includes('Buy groceries'))).toHaveLength(1);

		// Task should be in Log
		const logIdx = lines.indexOf('## Log');
		const taskIdx = lines.indexOf('- [x] Buy groceries');
		expect(taskIdx).toBeGreaterThan(logIdx);
	});

	it('moves root ancestor when nested task is completed', () => {
		const doc = [
			'## Todo',
			'- [ ] Parent task',
			'  - [x] Completed child',
			'  - [ ] Open sibling',
			'',
			'## Log',
			'- Done thing'
		].join('\n');

		const result = computeAutoMove(doc, 2, '## Todo', '## Log');
		expect(result).not.toBeNull();

		const applied = applyChanges(doc, result!.changes);
		const lines = applied.split('\n');

		// Entire block should be in Log
		const logIdx = lines.indexOf('## Log');
		const parentIdx = lines.indexOf('- [ ] Parent task');
		expect(parentIdx).toBeGreaterThan(logIdx);
		expect(lines).toContain('  - [x] Completed child');
		expect(lines).toContain('  - [ ] Open sibling');

		// Todo should only have the heading
		const todoIdx = lines.indexOf('## Todo');
		expect(todoIdx).toBeGreaterThanOrEqual(0);
	});

	it('inserts before first blank line in Log', () => {
		const doc = [
			'## Todo',
			'- [x] Done task',
			'',
			'## Log',
			'- Already done',
			'',
			'- 14:00 Future meeting'
		].join('\n');

		const result = computeAutoMove(doc, 1, '## Todo', '## Log');
		expect(result).not.toBeNull();

		const applied = applyChanges(doc, result!.changes);
		const lines = applied.split('\n');

		const alreadyDoneIdx = lines.indexOf('- Already done');
		const doneTaskIdx = lines.indexOf('- [x] Done task');
		const blankIdx = lines.indexOf('', doneTaskIdx + 1);
		const futureIdx = lines.indexOf('- 14:00 Future meeting');

		// Inserted after "Already done" and before the blank line
		expect(doneTaskIdx).toBeGreaterThan(alreadyDoneIdx);
		expect(futureIdx).toBeGreaterThan(doneTaskIdx);
	});

	it('appends after last list item when Log has no blank line', () => {
		const doc = [
			'## Todo',
			'- [x] Done task',
			'',
			'## Log',
			'- Item 1',
			'- Item 2'
		].join('\n');

		const result = computeAutoMove(doc, 1, '## Todo', '## Log');
		expect(result).not.toBeNull();

		const applied = applyChanges(doc, result!.changes);
		const lines = applied.split('\n');

		const item2Idx = lines.indexOf('- Item 2');
		const doneIdx = lines.indexOf('- [x] Done task');
		expect(doneIdx).toBeGreaterThan(item2Idx);
	});

	it('inserts after heading in empty Log section', () => {
		const doc = [
			'## Todo',
			'- [x] Done task',
			'',
			'## Log'
		].join('\n');

		const result = computeAutoMove(doc, 1, '## Todo', '## Log');
		expect(result).not.toBeNull();

		const applied = applyChanges(doc, result!.changes);
		const lines = applied.split('\n');

		const logIdx = lines.indexOf('## Log');
		const doneIdx = lines.indexOf('- [x] Done task');
		expect(doneIdx).toBe(logIdx + 1);
	});

	it('creates Log section if missing', () => {
		const doc = [
			'## Todo',
			'- [x] Done task',
			'- [ ] Other task'
		].join('\n');

		const result = computeAutoMove(doc, 1, '## Todo', '## Log');
		expect(result).not.toBeNull();

		const applied = applyChanges(doc, result!.changes);
		expect(applied).toContain('## Log');
		expect(applied).toContain('- [x] Done task');

		const lines = applied.split('\n');
		const logIdx = lines.indexOf('## Log');
		const taskIdx = lines.indexOf('- [x] Done task');
		expect(taskIdx).toBeGreaterThan(logIdx);
	});

	it('returns null if completed line is not in Todo section', () => {
		const doc = [
			'## Log',
			'- [x] Already in log',
			'',
			'## Todo',
			'- [ ] Task'
		].join('\n');

		expect(computeAutoMove(doc, 1, '## Todo', '## Log')).toBeNull();
	});

	it('returns null if completed line is not a task', () => {
		const doc = [
			'## Todo',
			'- Just a note',
			'',
			'## Log'
		].join('\n');

		expect(computeAutoMove(doc, 1, '## Todo', '## Log')).toBeNull();
	});

	it('returns null if Todo section does not exist', () => {
		const doc = [
			'## Log',
			'- Item'
		].join('\n');

		expect(computeAutoMove(doc, 1, '## Todo', '## Log')).toBeNull();
	});

	it('handles Log before Todo in document', () => {
		const doc = [
			'## Log',
			'- Done thing',
			'',
			'## Todo',
			'- [x] Completed task',
			'- [ ] Open task'
		].join('\n');

		const result = computeAutoMove(doc, 4, '## Todo', '## Log');
		expect(result).not.toBeNull();

		const applied = applyChanges(doc, result!.changes);
		const lines = applied.split('\n');

		// Task should be in Log section
		const logIdx = lines.indexOf('## Log');
		const todoIdx = lines.indexOf('## Todo');
		const taskIdx = lines.indexOf('- [x] Completed task');
		expect(taskIdx).toBeGreaterThan(logIdx);
		expect(taskIdx).toBeLessThan(todoIdx);
	});

	it('moves task with deeply nested children', () => {
		const doc = [
			'## Todo',
			'- [x] Parent',
			'  - Child',
			'    - Grandchild',
			'      - Great-grandchild',
			'',
			'## Log',
			'- Item'
		].join('\n');

		const result = computeAutoMove(doc, 1, '## Todo', '## Log');
		expect(result).not.toBeNull();

		const applied = applyChanges(doc, result!.changes);
		expect(applied).toContain('- [x] Parent');
		expect(applied).toContain('  - Child');
		expect(applied).toContain('    - Grandchild');
		expect(applied).toContain('      - Great-grandchild');
	});
});

/**
 * Apply CM6-style changes (sorted by position, in original doc coordinates) to a string.
 */
function applyChanges(doc: string, changes: Array<{ from: number; to: number; insert: string }>): string {
	// Apply changes in reverse order to preserve positions
	const sorted = [...changes].sort((a, b) => b.from - a.from);
	let result = doc;
	for (const change of sorted) {
		result = result.slice(0, change.from) + change.insert + result.slice(change.to);
	}
	return result;
}
