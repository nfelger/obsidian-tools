import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Editor } from 'obsidian';
import { findSelectedTaskLines } from '../../src/utils/commandSetup';
import { parseMarkdownToListItems } from '../helpers/markdownParser.js';
import type { ListItem } from '../../src/types';

/**
 * Minimal editor fake supporting multiple selection ranges.
 */
function fakeEditor(content: string, selections: Array<{ anchor: number; head: number }>): Editor {
	const lines = content.split('\n');
	return {
		somethingSelected: () => selections.length > 0,
		listSelections: () => selections.map(s => ({
			anchor: { line: s.anchor, ch: 0 },
			head: { line: s.head, ch: 0 }
		})),
		getCursor: () => ({ line: 0, ch: 0 }),
		getLine: (n: number) => lines[n] ?? ''
	} as unknown as Editor;
}

const content = [
	'- [ ] Task A',
	'- note',
	'- [ ] Task B',
	'- [ ] Task C'
].join('\n');

const listItems = parseMarkdownToListItems(content) as ListItem[];

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('findSelectedTaskLines', () => {
	it('collects tasks from a single selection range', () => {
		const editor = fakeEditor(content, [{ anchor: 0, head: 2 }]);
		expect(findSelectedTaskLines(editor, listItems, 'test')).toEqual([0, 2]);
	});

	it('collects tasks from all selection ranges (multi-cursor)', () => {
		const editor = fakeEditor(content, [
			{ anchor: 0, head: 0 },
			{ anchor: 2, head: 3 }
		]);
		expect(findSelectedTaskLines(editor, listItems, 'test')).toEqual([0, 2, 3]);
	});

	it('deduplicates overlapping selection ranges', () => {
		const editor = fakeEditor(content, [
			{ anchor: 0, head: 2 },
			{ anchor: 2, head: 3 }
		]);
		expect(findSelectedTaskLines(editor, listItems, 'test')).toEqual([0, 2, 3]);
	});

	it('returns null when no range contains a task', () => {
		const editor = fakeEditor(content, [{ anchor: 1, head: 1 }]);
		expect(findSelectedTaskLines(editor, listItems, 'test')).toBeNull();
	});
});
