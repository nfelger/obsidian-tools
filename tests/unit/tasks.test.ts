import { describe, it, expect } from 'vitest';
import {
	isIncompleteTask,
	dedentLinesByAmount,
	insertUnderLogHeading
} from '../../src/utils/tasks';

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

describe('insertUnderLogHeading', () => {
	it('inserts after existing ## Log heading', () => {
		const content = `# Note

## Log

Existing content`;
		const result = insertUnderLogHeading(content, '- New task');
		expect(result).toContain('## Log\n- New task\n\nExisting content');
	});

	it('creates ## Log heading if missing', () => {
		const content = `# Note

Some content`;
		const result = insertUnderLogHeading(content, '- New task');
		expect(result).toContain('## Log\n- New task');
	});

	it('inserts after frontmatter when creating ## Log', () => {
		const content = `---
title: Note
---

Some content`;
		const result = insertUnderLogHeading(content, '- New task');
		const lines = result.split('\n');
		expect(lines[0]).toBe('---');
		expect(lines[1]).toBe('title: Note');
		expect(lines[2]).toBe('---');
		expect(lines[3]).toBe('## Log');
		expect(lines[4]).toBe('- New task');
	});

	it('inserts at top of empty file', () => {
		const content = '';
		const result = insertUnderLogHeading(content, '- New task');
		expect(result.trim()).toBe('## Log\n- New task');
	});

	it('handles multiple insertions', () => {
		let content = '# Note\n\nSome content';
		content = insertUnderLogHeading(content, '- Task 1');
		content = insertUnderLogHeading(content, '- Task 2');

		const lines = content.split('\n');
		const logIdx = lines.findIndex(l => l === '## Log');
		expect(lines[logIdx + 1]).toBe('- Task 2'); // Most recent first
		expect(lines[logIdx + 2]).toBe('- Task 1');
	});
});
