import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/types';
import type { ListItem } from '../../src/types';
import { parseMarkdownToListItems } from '../helpers/markdownParser.js';
import {
	isProjectNote,
	getProjectName,
	parseProjectKeywords,
	insertUnderCollectorTask,
	stripProjectPrefix,
	stripResolvedProjectPrefix,
	parseProjectPrefix,
	linkTargetBasename,
	parseCollectorLine,
	findCollector,
	findPrefixedProjectTasks,
	findProjectTaskMatch,
	insertProjectTasksInSection,
	detectProjectContext,
	detectCollectorContext,
	routeTaskInsert
} from '../../src/utils/projects';
import type { ProjectTaskInsertItem, TaskInsertItem } from '../../src/types';

describe('isProjectNote', () => {
	it('returns true for a file directly in the projects folder', () => {
		expect(isProjectNote('1 Projekte/Migration Initiative.md')).toBe(true);
	});

	it('returns false for a file in a subfolder of the projects folder', () => {
		expect(isProjectNote('1 Projekte/sub/nested.md')).toBe(false);
	});

	it('returns false for a file outside the projects folder', () => {
		expect(isProjectNote('+Diary/2026/01/2026-01-30 Fri.md')).toBe(false);
	});

	it('returns false for empty path', () => {
		expect(isProjectNote('')).toBe(false);
	});

	it('uses custom projects folder from settings', () => {
		const settings = { ...DEFAULT_SETTINGS, projectsFolder: 'Projects' };
		expect(isProjectNote('Projects/My Project.md', settings)).toBe(true);
		expect(isProjectNote('1 Projekte/My Project.md', settings)).toBe(false);
	});

	it('returns false when projects folder is empty', () => {
		const settings = { ...DEFAULT_SETTINGS, projectsFolder: '' };
		expect(isProjectNote('1 Projekte/test.md', settings)).toBe(false);
	});
});

describe('getProjectName', () => {
	it('extracts project name from path', () => {
		expect(getProjectName('1 Projekte/Migration Initiative.md')).toBe('Migration Initiative');
	});

	it('returns null for non-project paths', () => {
		expect(getProjectName('+Diary/2026/01/daily.md')).toBeNull();
	});

	it('handles filenames without .md extension gracefully', () => {
		expect(getProjectName('1 Projekte/NoExtension')).toBe('NoExtension');
	});
});

describe('stripProjectPrefix', () => {
	it('strips a plain project link prefix', () => {
		expect(stripProjectPrefix('[[Migration Initiative]] Draft plan', 'Migration Initiative'))
			.toBe('Draft plan');
	});

	it('strips an aliased project link prefix', () => {
		expect(stripProjectPrefix('[[Migration Initiative|MI]] Draft plan', 'Migration Initiative'))
			.toBe('Draft plan');
	});

	it('leaves text without the prefix unchanged', () => {
		expect(stripProjectPrefix('Draft plan for [[Migration Initiative]]', 'Migration Initiative'))
			.toBe('Draft plan for [[Migration Initiative]]');
		expect(stripProjectPrefix('[[Other Project]] Draft plan', 'Migration Initiative'))
			.toBe('[[Other Project]] Draft plan');
	});

	it('handles project names with special regex characters', () => {
		expect(stripProjectPrefix('[[My (Project)|MP]] Task', 'My (Project)')).toBe('Task');
	});
});

describe('parseProjectPrefix', () => {
	it('parses a plain prefix', () => {
		expect(parseProjectPrefix('[[Migration Initiative]] Draft plan')).toEqual({
			linkTarget: 'Migration Initiative',
			alias: null,
			linkText: '[[Migration Initiative]]',
			rest: 'Draft plan'
		});
	});

	it('parses an aliased prefix', () => {
		expect(parseProjectPrefix('[[Migration Initiative|MI]] Draft plan')).toEqual({
			linkTarget: 'Migration Initiative',
			alias: 'MI',
			linkText: '[[Migration Initiative|MI]]',
			rest: 'Draft plan'
		});
	});

	it('parses a path-form prefix', () => {
		const parsed = parseProjectPrefix('[[1 Projekte/Migration Initiative]] Draft plan');
		expect(parsed?.linkTarget).toBe('1 Projekte/Migration Initiative');
		expect(linkTargetBasename(parsed!.linkTarget)).toBe('Migration Initiative');
	});

	it('treats extra pipes as part of the alias', () => {
		expect(parseProjectPrefix('[[P|a|b]] Task')?.alias).toBe('a|b');
	});

	it('returns null for a non-leading link', () => {
		expect(parseProjectPrefix('Ask about [[Migration Initiative]]')).toBeNull();
	});

	it('returns null for a pure link with no rest', () => {
		expect(parseProjectPrefix('[[Migration Initiative]]')).toBeNull();
	});
});

describe('stripResolvedProjectPrefix', () => {
	const project = { path: '1 Projekte/Catchup S26.md', basename: 'Catchup S26' };
	// Stands in for Obsidian's resolution: case-insensitive, path- and
	// section-tolerant, and aware of a frontmatter alias
	const resolver = {
		resolve: (linkPath: string) => {
			const target = linkPath.split('/').pop()!.toLowerCase();
			if (target === 'catchup s26' || target === 'catchup') {
				return { path: project.path, basename: project.basename, extension: 'md', index: 0, matchText: '', inner: '' };
			}
			if (target === 'other project') {
				return { path: '1 Projekte/Other Project.md', basename: 'Other Project', extension: 'md', index: 0, matchText: '', inner: '' };
			}
			return null;
		}
	};
	const strip = (taskText: string) => stripResolvedProjectPrefix(taskText, project, 'daily.md', resolver);

	it('strips every link form that resolves to the project', () => {
		expect(strip('[[Catchup S26]] Inbox Zero')).toBe('Inbox Zero');
		expect(strip('[[Catchup S26|P: Catchup]] Inbox Zero')).toBe('Inbox Zero');
		expect(strip('[[1 Projekte/Catchup S26|P: Catchup]] Inbox Zero')).toBe('Inbox Zero');
		expect(strip('[[Catchup S26#Todo|P: Catchup]] Inbox Zero')).toBe('Inbox Zero');
		expect(strip('[[catchup s26]] Inbox Zero')).toBe('Inbox Zero');
		// Resolves via a frontmatter alias — the text matches no basename
		expect(strip('[[Catchup]] Inbox Zero')).toBe('Inbox Zero');
	});

	it('leaves prefixes for other notes, and mid-line links, alone', () => {
		expect(strip('[[Other Project]] Inbox Zero')).toBe('[[Other Project]] Inbox Zero');
		expect(strip('Ask about [[Catchup S26]] tomorrow')).toBe('Ask about [[Catchup S26]] tomorrow');
		expect(strip('Inbox Zero')).toBe('Inbox Zero');
	});

	it('falls back to the basename convention for an unresolvable link', () => {
		expect(strip('[[Catchup S26 (missing)]] Task')).toBe('[[Catchup S26 (missing)]] Task');
		expect(stripResolvedProjectPrefix('[[Catchup S26]] Task', project, 'daily.md', { resolve: () => null }))
			.toBe('Task');
	});
});

describe('stripProjectPrefix (alias/path-aware)', () => {
	it('strips a path-form prefix by basename', () => {
		expect(stripProjectPrefix('[[1 Projekte/Migration Initiative]] Task', 'Migration Initiative')).toBe('Task');
	});

	it('leaves a different project untouched', () => {
		expect(stripProjectPrefix('[[Other Project]] Task', 'Migration Initiative')).toBe('[[Other Project]] Task');
	});
});

describe('parseCollectorLine', () => {
	const kw = ['Push', 'Finish'];

	it.each([
		['- Push [[P]]'],
		['- [ ] Push [[P]]'],
		['- [/] Push [[P]]'],
		['- [ ] Finish [[P]]'],
		['- [ ] Push [[1 Projekte/P]]']
	])('recognizes %s', (line) => {
		expect(parseCollectorLine(line, 'P', kw)).not.toBeNull();
	});

	it('reports the alias and linkText', () => {
		expect(parseCollectorLine('- [ ] Push [[P|prio]]', 'P', kw))
			.toEqual({ alias: 'prio', linkText: '[[P|prio]]' });
	});

	it.each([
		['- [x] Push [[P]]'],
		['- [>] Push [[P]]'],
		['- [ ] Push [[P]] tomorrow'],
		['- [ ] Pushing [[P]]'],
		['- [ ] Push [[Other]]'],
		['- [ ] Push P']
	])('rejects %s', (line) => {
		expect(parseCollectorLine(line, 'P', kw)).toBeNull();
	});
});

describe('findCollector / findPrefixedProjectTasks', () => {
	const lines = `
## Todo
- [ ] [[P|x]] task one
- [ ] Push [[P|prio]]
	- [ ] nested under collector
- [<] [[P]] task two
- [ ] [[Other]] unrelated
	- [ ] [[P]] nested prefixed
## Log
`.trim().split('\n');
	const range = { start: 0, end: 7 };

	it('finds the first collector in the section with alias', () => {
		expect(findCollector(lines, range, 'P', ['Push'])).toEqual({
			line: 2, alias: 'prio', linkText: '[[P|prio]]'
		});
	});

	it('returns null when no collector matches', () => {
		expect(findCollector(lines, range, 'Other', ['Push'])).toBeNull();
	});

	it('returns the first of several collectors', () => {
		const dup = `
## Todo
- [ ] Push [[P]]
- [ ] Finish [[P]]
`.trim().split('\n');
		expect(findCollector(dup, { start: 0, end: 3 }, 'P', ['Push', 'Finish'])?.line).toBe(1);
	});

	it('lists top-level prefixed tasks only, nested ones excluded', () => {
		expect(findPrefixedProjectTasks(lines, range, 'P')).toEqual([
			{ line: 1, alias: 'x' },
			{ line: 4, alias: null }
		]);
	});

	it('includes terminal copies, so a regroup keeps the project whole', () => {
		const withHistory = `
## Todo
- [x] [[P]] done task
- [>] [[P]] migrated task
- [ ] [[P]] live task
`.trim().split('\n');
		expect(findPrefixedProjectTasks(withHistory, { start: 0, end: 4 }, 'P')).toEqual([
			{ line: 1, alias: null },
			{ line: 2, alias: null },
			{ line: 3, alias: null }
		]);
	});
});

describe('findProjectTaskMatch', () => {
	const opts = { heading: '## Todo', keywords: ['Push'] };
	const content = `
## Todo
- [ ] [[P|alias]] prefixed copy
- [ ] Push [[P]]
	- [<] under collector
	- [x] done under collector
- [ ] plain task
- [ ] [[Other]] wrong project

## Log
- [ ] [[P]] outside section
`.trim();

	it('matches a prefixed copy alias-insensitively', () => {
		expect(findProjectTaskMatch(content, 'prefixed copy', 'P', opts))
			.toEqual({ lineNumber: 1, state: ' ' });
	});

	it('matches a scheduled copy under the collector', () => {
		expect(findProjectTaskMatch(content, 'under collector', 'P', opts))
			.toEqual({ lineNumber: 3, state: '<' });
	});

	it('ignores completed copies, plain tasks, and other projects', () => {
		expect(findProjectTaskMatch(content, 'done under collector', 'P', opts)).toBeNull();
		expect(findProjectTaskMatch(content, 'plain task', 'P', opts)).toBeNull();
		expect(findProjectTaskMatch(content, 'wrong project', 'P', opts)).toBeNull();
	});

	it('ignores copies outside the section and missing sections', () => {
		expect(findProjectTaskMatch(content, 'outside section', 'P', opts)).toBeNull();
		expect(findProjectTaskMatch('- [ ] [[P]] x', 'x', 'P', opts)).toBeNull();
	});
});

const opts = { targetHeading: '## Todo', keywords: ['Push'] };
const item = (taskText: string, linkText: string, childrenContent = '') => ({
	taskText,
	taskContent: childrenContent ? `- [ ] ${taskText}\n${childrenContent}` : `- [ ] ${taskText}`,
	childrenContent,
	linkText
});

describe('insertProjectTasksInSection — dedup', () => {
	it('merges into an existing prefixed copy, alias-insensitively', () => {
		const content = `
## Todo
- [<] [[P|other]] Review PR
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('Review PR', '[[P]]', '\t- new note')], opts);
		expect(result.mergedCount).toBe(1);
		expect(result.content).toContain('- [ ] [[P|other]] Review PR');
		expect(result.content).toContain('\t- new note');
	});

	it('merges into a copy under a collector, in place', () => {
		const content = `
## Todo
- [ ] Push [[P]]
	- [<] Review PR
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('Review PR', '[[P]]', '\t- new note')], opts);
		expect(result.mergedCount).toBe(1);
		expect(result.newCount).toBe(0);
		expect(result.content.match(/Review PR/g)).toHaveLength(1);
		expect(result.content).toContain('\t- [ ] Review PR');
	});

	it('still dedups against a copy inside a sub-section', () => {
		const content = `
## Todo

### Monday
- [<] [[P]] Review PR
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('Review PR', '[[P]]')], opts);
		expect(result.mergedCount).toBe(1);
		expect(result.newCount).toBe(0);
		expect(result.content).toContain('### Monday\n- [ ] [[P]] Review PR');
	});
});

describe('insertProjectTasksInSection — never groups', () => {
	it('appends prefixed next to a collector, never under it', () => {
		const content = `
## Todo
- [ ] Push [[P]]
	- [ ] existing
- [ ] unrelated

## Log
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P|EU]]')], opts);
		expect(result.newCount).toBe(1);
		expect(result.content.split('\n')).toEqual([
			'## Todo',
			'- [ ] Push [[P]]',
			'\t- [ ] existing',
			'- [ ] unrelated',
			'- [ ] [[P|EU]] New task',
			'',
			'## Log'
		]);
	});

	it('leaves a prefixed sibling loose and appends next to it', () => {
		const content = `
## Todo
- [ ] unrelated
- [ ] [[P]] existing task
	- child
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P]]')], opts);
		expect(result.content.split('\n')).toEqual([
			'## Todo',
			'- [ ] unrelated',
			'- [ ] [[P]] existing task',
			'\t- child',
			'- [ ] [[P]] New task'
		]);
	});

	it('keeps several siblings loose rather than gathering them', () => {
		const content = `
## Todo
- [ ] [[P]] first
- [ ] between
- [ ] [[P]] second
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P]]')], opts);
		expect(result.content).not.toContain('Push [[P');
		expect(result.content.split('\n')).toEqual([
			'## Todo',
			'- [ ] [[P]] first',
			'- [ ] between',
			'- [ ] [[P]] second',
			'- [ ] [[P]] New task'
		]);
	});

	it('appends multi-select tasks as prefixed siblings, in order', () => {
		const result = insertProjectTasksInSection(
			'## Todo\n- [ ] unrelated', 'P',
			[item('first', '[[P|EU]]'), item('second', '[[P]]')],
			opts
		);
		expect(result.newCount).toBe(2);
		expect(result.content.split('\n')).toEqual([
			'## Todo',
			'- [ ] unrelated',
			'- [ ] [[P|EU]] first',
			'- [ ] [[P]] second'
		]);
	});

	it('creates the heading without a collector when the section is missing', () => {
		const result = insertProjectTasksInSection('# Note', 'P', [item('a', '[[P]]'), item('b', '[[P]]')], opts);
		expect(result.content).toContain('## Todo');
		expect(result.content).not.toContain('Push');
		expect(result.content).toContain('- [ ] [[P]] a');
		expect(result.content).toContain('- [ ] [[P]] b');
	});

	it('re-renders appended tasks in the target indent unit (spaces)', () => {
		const content = `
## Todo
- [ ] [[P]] existing
  - child
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P]]', '\t- tab child')], opts);
		expect(result.content).toContain('  - tab child');
		expect(result.content).not.toContain('\t');
	});
});

describe('insertProjectTasksInSection — sub-section boundaries', () => {
	it('appends into the section body, not the last sub-section', () => {
		const content = `
## Todo

### Monday
- [ ] [[P]] monday task

### Tuesday
- [ ] [[P]] tuesday task

## Log
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P]]')], opts);
		expect(result.content).toBe(`
## Todo
- [ ] [[P]] New task

### Monday
- [ ] [[P]] monday task

### Tuesday
- [ ] [[P]] tuesday task

## Log
`.trim());
	});

	it('ignores a collector inside a sub-section', () => {
		const content = `
## Todo
### Someday
- [ ] Push [[P]]
	- [ ] someday task
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P]]')], opts);
		expect(result.content.split('\n')).toEqual([
			'## Todo',
			'- [ ] [[P]] New task',
			'### Someday',
			'- [ ] Push [[P]]',
			'\t- [ ] someday task'
		]);
	});
});

describe('parseProjectKeywords', () => {
	it('parses comma-separated quoted keywords', () => {
		expect(parseProjectKeywords('"Push", "Finish"')).toEqual(['Push', 'Finish']);
	});

	it('handles single keyword', () => {
		expect(parseProjectKeywords('"Push"')).toEqual(['Push']);
	});

	it('handles empty string', () => {
		expect(parseProjectKeywords('')).toEqual([]);
	});

	it('handles keywords with spaces', () => {
		expect(parseProjectKeywords('"Work on", "Finish up"')).toEqual(['Work on', 'Finish up']);
	});

	it('ignores text outside quotes', () => {
		expect(parseProjectKeywords('junk "Push" more junk "Finish"')).toEqual(['Push', 'Finish']);
	});
});

describe('insertUnderCollectorTask', () => {
	it('inserts task as subtask using tabs when file has no indentation signal', () => {
		const content = `- [ ] Push [[Migration Initiative]]
- [ ] Other task`;
		const result = insertUnderCollectorTask(content, 0, '- [ ] [[Migration Initiative]] Define rollback');
		expect(result).toBe(`- [ ] Push [[Migration Initiative]]
\t- [ ] [[Migration Initiative]] Define rollback
- [ ] Other task`);
	});

	it('inserts after existing subtasks matching their indent unit', () => {
		const content = `- [ ] Push [[Migration Initiative]]
  - [ ] Existing subtask
- [ ] Other task`;
		const result = insertUnderCollectorTask(content, 0, '- [ ] [[Migration Initiative]] New task');
		expect(result).toBe(`- [ ] Push [[Migration Initiative]]
  - [ ] Existing subtask
  - [ ] [[Migration Initiative]] New task
- [ ] Other task`);
	});

	it('handles indented collector task using the file indent unit', () => {
		const content = `- Parent
    - [ ] Push [[Migration Initiative]]
    - [ ] Other`;
		const result = insertUnderCollectorTask(content, 1, '- [ ] [[Migration Initiative]] Task');
		expect(result).toBe(`- Parent
    - [ ] Push [[Migration Initiative]]
        - [ ] [[Migration Initiative]] Task
    - [ ] Other`);
	});

	it('stays inside the list block when a blank line follows the collector', () => {
		const content = `- [ ] Push [[Migration Initiative]]
\t- [ ] Existing subtask

## Log`;
		const result = insertUnderCollectorTask(content, 0, '- [ ] New task');
		expect(result).toBe(`- [ ] Push [[Migration Initiative]]
\t- [ ] Existing subtask
\t- [ ] New task

## Log`);
	});

	it('nests under a tab-indented collector with tabs, converting task children', () => {
		const content = `- Plan
\t- [ ] Push [[Migration Initiative]]
- [ ] Other`;
		const result = insertUnderCollectorTask(content, 1, '- [ ] Define rollback\n  - check constraints');
		expect(result).toBe(`- Plan
\t- [ ] Push [[Migration Initiative]]
\t\t- [ ] Define rollback
\t\t\t- check constraints
- [ ] Other`);
	});
});

describe('detectProjectContext', () => {
	const resolver = {
		resolve: (linkPath: string) => {
			const basename = linkPath.split('/').pop()!;
			if (['P', 'Other'].includes(basename)) {
				return { path: `1 Projekte/${basename}.md`, basename, extension: 'md', index: 0, matchText: '', inner: '' };
			}
			return null;
		}
	};
	const setup = (markdown: string) => {
		const content = markdown.replace(/^\n/, '').replace(/\n$/, '');
		const listItems = parseMarkdownToListItems(content) as ListItem[];
		return { editor: { getLine: (n: number) => content.split('\n')[n] }, listItems };
	};

	it('detects an own aliased prefix', () => {
		const { editor, listItems } = setup(`
- [ ] [[P|EU]] Draft plan
`);
		expect(detectProjectContext(editor, listItems, 0, 'daily.md', resolver)).toEqual({
			projectName: 'P',
			path: '1 Projekte/P.md',
			linkText: '[[P|EU]]',
			strippedText: 'Draft plan',
			hasOwnPrefix: true
		});
	});

	it('detects a collector ancestor', () => {
		const { editor, listItems } = setup(`
- [ ] Push [[P|EU]]
	- [ ] Draft plan
`);
		expect(detectProjectContext(editor, listItems, 1, 'daily.md', resolver)).toEqual({
			projectName: 'P',
			path: '1 Projekte/P.md',
			linkText: '[[P|EU]]',
			strippedText: 'Draft plan',
			hasOwnPrefix: false
		});
	});

	it('ignores a mid-line project link on the task line itself', () => {
		const { editor, listItems } = setup(`
- [ ] Ask about [[P]] tomorrow
`);
		expect(detectProjectContext(editor, listItems, 0, 'daily.md', resolver)).toBeNull();
	});

	it('ignores a leading link that is not a project note', () => {
		const { editor, listItems } = setup(`
- [ ] [[Some Note]] Draft plan
`);
		expect(detectProjectContext(editor, listItems, 0, 'daily.md', resolver)).toBeNull();
	});
});

describe('detectCollectorContext', () => {
	const resolver = {
		resolve: (linkPath: string) => {
			const basename = linkPath.split('/').pop()!;
			if (['P', 'Other'].includes(basename)) {
				return { path: `1 Projekte/${basename}.md`, basename, extension: 'md', index: 0, matchText: '', inner: '' };
			}
			return null;
		}
	};
	const settings = { ...DEFAULT_SETTINGS, projectKeywords: '"Push", "Finish"' };

	it('detects a task-form collector with an alias', () => {
		expect(detectCollectorContext('- [ ] Push [[P|EU]]', 'daily.md', resolver, settings)).toEqual({
			projectName: 'P',
			linkText: '[[P|EU]]'
		});
	});

	it('detects a plain-bullet collector', () => {
		expect(detectCollectorContext('- Finish [[P]]', 'daily.md', resolver, settings)).toEqual({
			projectName: 'P',
			linkText: '[[P]]'
		});
	});

	it('returns null for a completed collector-shaped line', () => {
		expect(detectCollectorContext('- [x] Push [[P]]', 'daily.md', resolver, settings)).toBeNull();
	});

	it('returns null when the link does not resolve to a project note', () => {
		expect(detectCollectorContext('- [ ] Push [[Some Note]]', 'daily.md', resolver, settings)).toBeNull();
	});

	it('returns null for an ordinary task line', () => {
		expect(detectCollectorContext('- [ ] [[P]] Draft plan', 'daily.md', resolver, settings)).toBeNull();
	});
});

describe('routeTaskInsert', () => {
	const prepared = {
		taskText: 'Draft plan',
		taskContent: '- [ ] Draft plan',
		childrenContent: '',
		lineForTarget: '- [ ] Draft plan'
	};

	it('pushes to collectedTasks when there is no project context', () => {
		const projectGroups = new Map<string, ProjectTaskInsertItem[]>();
		const collectedTasks: TaskInsertItem[] = [];

		routeTaskInsert(null, prepared, projectGroups, collectedTasks);

		expect(collectedTasks).toEqual([
			{ taskText: 'Draft plan', taskContent: '- [ ] Draft plan', childrenContent: '' }
		]);
		expect(projectGroups.size).toBe(0);
	});

	it('groups by project and renders the link prefix when the task has no prefix of its own', () => {
		const projectGroups = new Map<string, ProjectTaskInsertItem[]>();
		const collectedTasks: TaskInsertItem[] = [];

		routeTaskInsert(
			{ projectName: 'P', linkText: '[[P]]', strippedText: 'Draft plan', hasOwnPrefix: false },
			prepared,
			projectGroups,
			collectedTasks
		);

		expect(collectedTasks).toEqual([]);
		expect(projectGroups.get('P')).toEqual([
			{ taskText: 'Draft plan', taskContent: '- [ ] Draft plan', childrenContent: '', linkText: '[[P]]' }
		]);
	});

	it('strips the task line back to its stripped text when the task already carries its own prefix', () => {
		const projectGroups = new Map<string, ProjectTaskInsertItem[]>();
		const collectedTasks: TaskInsertItem[] = [];

		routeTaskInsert(
			{ projectName: 'P', linkText: '[[P|EU]]', strippedText: 'Draft plan', hasOwnPrefix: true },
			{ ...prepared, lineForTarget: '- [ ] [[P|EU]] Draft plan' },
			projectGroups,
			collectedTasks
		);

		expect(projectGroups.get('P')).toEqual([
			{ taskText: 'Draft plan', taskContent: '- [ ] Draft plan', childrenContent: '', linkText: '[[P|EU]]' }
		]);
	});

	it('appends to an existing project group in call order', () => {
		const projectGroups = new Map<string, ProjectTaskInsertItem[]>();
		const collectedTasks: TaskInsertItem[] = [];
		const ctx = { projectName: 'P', linkText: '[[P]]', strippedText: '', hasOwnPrefix: false };

		routeTaskInsert(ctx, { ...prepared, taskText: 'First', lineForTarget: '- [ ] First' }, projectGroups, collectedTasks);
		routeTaskInsert(ctx, { ...prepared, taskText: 'Second', lineForTarget: '- [ ] Second' }, projectGroups, collectedTasks);

		expect(projectGroups.get('P')!.map(t => t.taskContent)).toEqual(['- [ ] First', '- [ ] Second']);
	});

	it('includes children in the rendered task content', () => {
		const projectGroups = new Map<string, ProjectTaskInsertItem[]>();
		const collectedTasks: TaskInsertItem[] = [];

		routeTaskInsert(
			{ projectName: 'P', linkText: '[[P]]', strippedText: 'Draft plan', hasOwnPrefix: false },
			{ ...prepared, childrenContent: '  - detail' },
			projectGroups,
			collectedTasks
		);

		expect(projectGroups.get('P')![0].taskContent).toBe('- [ ] Draft plan\n  - detail');
	});
});
