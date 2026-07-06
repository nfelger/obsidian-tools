import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/types';
import {
	isProjectNote,
	getProjectName,
	parseProjectKeywords,
	findCollectorTask,
	insertUnderCollectorTask,
	stripProjectPrefix,
	parseProjectPrefix,
	linkTargetBasename,
	parseCollectorLine,
	findCollector,
	findPrefixedProjectTasks,
	findProjectTaskMatch,
	insertProjectTasksInSection
} from '../../src/utils/projects';

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

	it('lists top-level live prefixed tasks only', () => {
		expect(findPrefixedProjectTasks(lines, range, 'P')).toEqual([
			{ line: 1, alias: 'x' },
			{ line: 4, alias: null }
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

describe('insertProjectTasksInSection — grouping disabled', () => {
	const opts = { targetHeading: '## Todo', keywords: ['Push'], groupUnderCollector: false };
	const item = (taskText: string, linkText: string, childrenContent = '') => ({
		taskText,
		taskContent: childrenContent ? `- [ ] ${taskText}\n${childrenContent}` : `- [ ] ${taskText}`,
		childrenContent,
		linkText
	});

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

	it('merges into a copy under a manually created collector', () => {
		const content = `
## Todo
- [ ] Push [[P]]
	- [ ] Review PR
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('Review PR', '[[P]]')], opts);
		expect(result.mergedCount).toBe(1);
		expect(result.content.match(/Review PR/g)).toHaveLength(1);
	});

	it('appends prefixed at the end of the section, never under a collector', () => {
		const content = `
## Todo
- [ ] Push [[P]]
	- [ ] existing
- [ ] unrelated

## Log
`.trim();
		const result = insertProjectTasksInSection(content, 'P', [item('New task', '[[P|EU]]')], opts);
		expect(result.newCount).toBe(1);
		const lines = result.content.split('\n');
		expect(lines[4]).toBe('- [ ] [[P|EU]] New task');
	});

	it('creates the heading when missing', () => {
		const result = insertProjectTasksInSection('# Note', 'P', [item('Task', '[[P]]')], opts);
		expect(result.content).toContain('## Todo');
		expect(result.content).toContain('- [ ] [[P]] Task');
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

describe('findCollectorTask', () => {
	it('finds a collector task matching keyword + project link', () => {
		const content = `- [ ] Push [[Migration Initiative]]
- [ ] Some other task`;
		expect(findCollectorTask(content, 'Migration Initiative', ['Push', 'Finish'])).toBe(0);
	});

	it('finds collector on non-first line', () => {
		const content = `- [x] Done task
- [ ] Finish [[Migration Initiative]]`;
		expect(findCollectorTask(content, 'Migration Initiative', ['Push', 'Finish'])).toBe(1);
	});

	it('returns null when no collector matches', () => {
		const content = `- [ ] Some unrelated task
- [ ] Another task`;
		expect(findCollectorTask(content, 'Migration Initiative', ['Push', 'Finish'])).toBeNull();
	});

	it('requires exact prefix match', () => {
		const content = `- [ ] Pushing [[Migration Initiative]]`;
		expect(findCollectorTask(content, 'Migration Initiative', ['Push'])).toBeNull();
	});

	it('skips completed tasks', () => {
		const content = `- [x] Push [[Migration Initiative]]`;
		expect(findCollectorTask(content, 'Migration Initiative', ['Push'])).toBeNull();
	});

	it('matches started tasks as collectors', () => {
		const content = `- [/] Push [[Migration Initiative]]`;
		expect(findCollectorTask(content, 'Migration Initiative', ['Push'])).toBe(0);
	});

	it('returns null with empty keywords', () => {
		const content = `- [ ] Push [[Migration Initiative]]`;
		expect(findCollectorTask(content, 'Migration Initiative', [])).toBeNull();
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
