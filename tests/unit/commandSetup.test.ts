import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Editor } from 'obsidian';
import {
	findSelectedTaskLines,
	getCollectorChildGroups,
	resolveProjectLinkAndFile,
	decomposeCollectorForTransfer
} from '../../src/utils/commandSetup';
import { parseMarkdownToListItems, normalizeMarkdown } from '../helpers/markdownParser.js';
import { createMockEditor } from '../mocks/obsidian.js';
import type { ListItem } from '../../src/types';

const projectResolver = {
	resolve: (linkPath: string) => {
		const basename = linkPath.split('/').pop()!;
		if (basename === 'P') {
			return { path: '1 Projekte/P.md', basename, extension: 'md', index: 0, matchText: '', inner: '' };
		}
		return null;
	}
};

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

describe('resolveProjectLinkAndFile', () => {
	const setup = (markdown: string) => {
		const content = markdown.replace(/^\n/, '').replace(/\n$/, '');
		const listItems = parseMarkdownToListItems(content) as ListItem[];
		return { editor: { getLine: (n: number) => content.split('\n')[n] }, listItems };
	};

	it('resolves the project link and file when both are found', () => {
		const { editor, listItems } = setup(`
- [ ] [[P]] Draft plan
`);
		const projectFile = { path: '1 Projekte/P.md' };
		const vault = { getAbstractFileByPath: (path: string) => (path === '1 Projekte/P.md' ? projectFile : null) };

		const result = resolveProjectLinkAndFile(
			editor, listItems, 0, 'daily.md', vault as any, projectResolver, undefined as any, 'Drop task to project'
		);

		expect(result).toEqual({
			link: { path: '1 Projekte/P.md', basename: 'P', extension: 'md', index: 6, matchText: '[[P]]', inner: 'P' },
			projectFile
		});
	});

	it('returns null when no project link is found on the line or its ancestors', () => {
		const { editor, listItems } = setup(`
- [ ] Draft plan
`);
		const vault = { getAbstractFileByPath: () => null };

		const result = resolveProjectLinkAndFile(
			editor, listItems, 0, 'daily.md', vault as any, projectResolver, undefined as any, 'Drop task to project'
		);

		expect(result).toBeNull();
	});

	it('returns null when the project link does not resolve to a file', () => {
		const { editor, listItems } = setup(`
- [ ] [[P]] Draft plan
`);
		const vault = { getAbstractFileByPath: () => null };

		const result = resolveProjectLinkAndFile(
			editor, listItems, 0, 'daily.md', vault as any, projectResolver, undefined as any, 'Drop task to project'
		);

		expect(result).toBeNull();
	});
});

describe('decomposeCollectorForTransfer', () => {
	const setup = (markdown: string) => {
		const normalized = normalizeMarkdown(markdown);
		const editor = createMockEditor({ content: normalized });
		const listItems = parseMarkdownToListItems(normalized) as ListItem[];
		return { editor, listItems };
	};

	it('decomposes task children into project-task items carrying the collector link', () => {
		const { editor, listItems } = setup(`
- [ ] Push [[P]]
	- [ ] First task
		- detail
	- [ ] Second task
`);
		const result = decomposeCollectorForTransfer(
			editor as unknown as Editor, listItems, 0, { projectName: 'P', linkText: '[[P]]' }, { reopenStarted: false }
		);

		expect(result.projectName).toBe('P');
		expect(result.items).toEqual([
			{ taskText: 'First task', taskContent: '- [ ] First task\n\t- detail', childrenContent: '\t- detail', linkText: '[[P]]' },
			{ taskText: 'Second task', taskContent: '- [ ] Second task', childrenContent: '', linkText: '[[P]]' }
		]);
		expect(result.children.removalRanges).toEqual([{ start: 3, end: 4 }, { start: 1, end: 3 }]);
	});

	it('reopens a started child to [ ] when reopenStarted is true', () => {
		const { editor, listItems } = setup(`
- [ ] Push [[P]]
	- [/] Started task
`);
		const result = decomposeCollectorForTransfer(
			editor as unknown as Editor, listItems, 0, { projectName: 'P', linkText: '[[P]]' }, { reopenStarted: true }
		);

		expect(result.items[0].taskContent).toBe('- [ ] Started task');
	});

	it('leaves a started child alone when reopenStarted is false', () => {
		const { editor, listItems } = setup(`
- [ ] Push [[P]]
	- [/] Started task
`);
		const result = decomposeCollectorForTransfer(
			editor as unknown as Editor, listItems, 0, { projectName: 'P', linkText: '[[P]]' }, { reopenStarted: false }
		);

		expect(result.items[0].taskContent).toBe('- [/] Started task');
	});

	it('excludes non-task children from the decomposed items', () => {
		const { editor, listItems } = setup(`
- [ ] Push [[P]]
	- a stray note
	- [ ] Real task
`);
		const result = decomposeCollectorForTransfer(
			editor as unknown as Editor, listItems, 0, { projectName: 'P', linkText: '[[P]]' }, { reopenStarted: false }
		);

		expect(result.items).toHaveLength(1);
		expect(result.items[0].taskText).toBe('Real task');
	});
});
