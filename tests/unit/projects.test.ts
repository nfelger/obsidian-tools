import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/types';
import {
	isProjectNote,
	getProjectName,
	parseProjectKeywords,
	findCollectorTask,
	insertUnderCollectorTask
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
	it('inserts task as subtask under collector', () => {
		const content = `- [ ] Push [[Migration Initiative]]
- [ ] Other task`;
		const result = insertUnderCollectorTask(content, 0, '- [ ] [[Migration Initiative]] Define rollback');
		expect(result).toBe(`- [ ] Push [[Migration Initiative]]
    - [ ] [[Migration Initiative]] Define rollback
- [ ] Other task`);
	});

	it('inserts after existing subtasks', () => {
		const content = `- [ ] Push [[Migration Initiative]]
    - [ ] Existing subtask
- [ ] Other task`;
		const result = insertUnderCollectorTask(content, 0, '- [ ] [[Migration Initiative]] New task');
		expect(result).toBe(`- [ ] Push [[Migration Initiative]]
    - [ ] Existing subtask
    - [ ] [[Migration Initiative]] New task
- [ ] Other task`);
	});

	it('handles indented collector task', () => {
		const content = `- Parent
    - [ ] Push [[Migration Initiative]]
    - [ ] Other`;
		const result = insertUnderCollectorTask(content, 1, '- [ ] [[Migration Initiative]] Task');
		expect(result).toBe(`- Parent
    - [ ] Push [[Migration Initiative]]
        - [ ] [[Migration Initiative]] Task
    - [ ] Other`);
	});
});
