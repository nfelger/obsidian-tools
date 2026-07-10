import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Editor } from 'obsidian';
import { findSelectedTaskLines, getCollectorChildGroups } from '../../src/utils/commandSetup';
import { parseMarkdownToListItems, normalizeMarkdown } from '../helpers/markdownParser.js';
import { createMockEditor } from '../mocks/obsidian.js';
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

describe('getCollectorChildGroups', () => {
	const setup = (markdown: string) => {
		const normalized = normalizeMarkdown(markdown);
		const editor = createMockEditor({ content: normalized });
		const listItems = parseMarkdownToListItems(normalized) as ListItem[];
		return { editor, listItems };
	};

	it('splits task children from a non-task sibling, skipping a terminal subtree entirely', () => {
		const { editor, listItems } = setup(`
- [ ] Push [[P]]
	- [ ] Storyline sketchen
		- nested note under task
	- a stray note directly under collector
	- [x] Already done task
		- terminal child (stays)
	- [ ] Another task
- [ ] Unrelated
`);

		const groups = getCollectorChildGroups(editor as unknown as Editor, listItems, 0);

		expect(groups).toEqual([
			{
				line: 1,
				isTask: true,
				lines: ['\t- [ ] Storyline sketchen', '\t\t- nested note under task'],
				range: { start: 1, end: 3 }
			},
			{
				line: 3,
				isTask: false,
				lines: ['\t- a stray note directly under collector'],
				range: { start: 3, end: 4 }
			},
			{
				line: 6,
				isTask: true,
				lines: ['\t- [ ] Another task'],
				range: { start: 6, end: 7 }
			}
		]);
	});

	it('attaches a blank line to the preceding group', () => {
		const { editor, listItems } = setup(`
- [ ] Push [[P]]
	- [ ] First task

	- [ ] Second task
`);

		const groups = getCollectorChildGroups(editor as unknown as Editor, listItems, 0);

		expect(groups).toEqual([
			{ line: 1, isTask: true, lines: ['\t- [ ] First task', ''], range: { start: 1, end: 3 } },
			{ line: 3, isTask: true, lines: ['\t- [ ] Second task'], range: { start: 3, end: 4 } }
		]);
	});

	it('returns an empty array when the collector has no children', () => {
		const { editor, listItems } = setup(`
- [ ] Push [[P]]
- [ ] Unrelated
`);

		expect(getCollectorChildGroups(editor as unknown as Editor, listItems, 0)).toEqual([]);
	});
});
