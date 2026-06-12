import { describe, it, expect } from 'vitest';
import {
	countIndent,
	dedentLines,
	getLeadingWhitespace,
	detectIndentUnit,
	convertIndentUnit,
	indentLinesWith
} from '../../src/utils/indent';

describe('countIndent', () => {
	it('should return 0 for non-indented line', () => {
		expect(countIndent('Hello world')).toBe(0);
	});

	it('should count spaces', () => {
		expect(countIndent('  Hello')).toBe(2);
		expect(countIndent('    Hello')).toBe(4);
	});

	it('should count tabs', () => {
		expect(countIndent('\tHello')).toBe(1);
		expect(countIndent('\t\tHello')).toBe(2);
	});

	it('should count mixed spaces and tabs', () => {
		expect(countIndent(' \tHello')).toBe(2);
		expect(countIndent('\t Hello')).toBe(2);
	});

	it('should return line length for blank lines', () => {
		expect(countIndent('   ')).toBe(3);
		expect(countIndent('')).toBe(0);
	});
});

describe('getLeadingWhitespace', () => {
	it('should return empty string for non-indented line', () => {
		expect(getLeadingWhitespace('- [ ] Task')).toBe('');
	});

	it('should return spaces', () => {
		expect(getLeadingWhitespace('  - Child')).toBe('  ');
	});

	it('should return tabs', () => {
		expect(getLeadingWhitespace('\t\t- Child')).toBe('\t\t');
	});

	it('should return mixed whitespace as-is', () => {
		expect(getLeadingWhitespace('\t  - Child')).toBe('\t  ');
	});
});

describe('detectIndentUnit', () => {
	it('should return null when no line is indented', () => {
		expect(detectIndentUnit(['- [ ] Task', '- Note'])).toBeNull();
	});

	it('should detect tabs', () => {
		expect(detectIndentUnit(['- [ ] Task', '\t- Child'])).toBe('\t');
	});

	it('should prefer tabs when any leading tab is present', () => {
		expect(detectIndentUnit(['  - Child', '\t- Other'])).toBe('\t');
	});

	it('should detect two-space indents', () => {
		expect(detectIndentUnit(['- [ ] Task', '  - Child', '    - Grandchild'])).toBe('  ');
	});

	it('should detect four-space indents', () => {
		expect(detectIndentUnit(['- [ ] Task', '    - Child'])).toBe('    ');
	});

	it('should ignore blank lines', () => {
		expect(detectIndentUnit(['- Task', '   ', ''])).toBeNull();
	});
});

describe('convertIndentUnit', () => {
	it('should convert space indents to tabs preserving depth', () => {
		const lines = ['- [ ] Task', '  - Child', '    - Grandchild'];
		expect(convertIndentUnit(lines, '\t')).toEqual([
			'- [ ] Task',
			'\t- Child',
			'\t\t- Grandchild'
		]);
	});

	it('should convert tab indents to spaces preserving depth', () => {
		const lines = ['- [ ] Task', '\t- Child', '\t\t- Grandchild'];
		expect(convertIndentUnit(lines, '  ')).toEqual([
			'- [ ] Task',
			'  - Child',
			'    - Grandchild'
		]);
	});

	it('should leave lines unchanged when units already match', () => {
		const lines = ['- Task', '\t- Child'];
		expect(convertIndentUnit(lines, '\t')).toEqual(['- Task', '\t- Child']);
	});

	it('should leave unindented content unchanged', () => {
		const lines = ['- Task', '- Other'];
		expect(convertIndentUnit(lines, '\t')).toEqual(['- Task', '- Other']);
	});

	it('should round partial indents up to a full unit', () => {
		// 3 spaces with a 2-space unit: one full unit + remainder → depth 2
		const lines = ['- Task', '  - Child', '   - Deeper'];
		expect(convertIndentUnit(lines, '\t')).toEqual(['- Task', '\t- Child', '\t\t- Deeper']);
	});

	it('should preserve blank lines', () => {
		const lines = ['- Task', '', '  - Child'];
		expect(convertIndentUnit(lines, '\t')).toEqual(['- Task', '', '\t- Child']);
	});
});

describe('indentLinesWith', () => {
	it('should prefix each non-blank line', () => {
		expect(indentLinesWith(['- A', '\t- B'], '\t')).toEqual(['\t- A', '\t\t- B']);
	});

	it('should leave blank lines empty', () => {
		expect(indentLinesWith(['- A', '', '- B'], '  ')).toEqual(['  - A', '', '  - B']);
	});

	it('should return copy for empty prefix', () => {
		expect(indentLinesWith(['- A'], '')).toEqual(['- A']);
	});
});

describe('dedentLines', () => {
	it('should not change lines with no indent', () => {
		const lines = ['Hello', 'World'];
		expect(dedentLines(lines)).toEqual(['Hello', 'World']);
	});

	it('should remove common leading indent', () => {
		const lines = [
			'  Line 1',
			'  Line 2'
		];
		expect(dedentLines(lines)).toEqual([
			'Line 1',
			'Line 2'
		]);
	});

	it('should preserve relative indentation', () => {
		const lines = [
			'  Line 1',
			'    Line 2 (more indented)',
			'  Line 3'
		];
		expect(dedentLines(lines)).toEqual([
			'Line 1',
			'  Line 2 (more indented)',
			'Line 3'
		]);
	});

	it('should handle blank lines', () => {
		const lines = [
			'  Line 1',
			'',
			'  Line 2'
		];
		expect(dedentLines(lines)).toEqual([
			'Line 1',
			'',
			'Line 2'
		]);
	});

	it('should handle lines with only whitespace', () => {
		const lines = [
			'  Line 1',
			'    ',
			'  Line 2'
		];
		expect(dedentLines(lines)).toEqual([
			'Line 1',
			'',
			'Line 2'
		]);
	});

	it('should not modify if minIndent is 0', () => {
		const lines = [
			'Line 1',
			'  Line 2'
		];
		expect(dedentLines(lines)).toEqual([
			'Line 1',
			'  Line 2'
		]);
	});

	it('should handle tabs', () => {
		const lines = [
			'\tLine 1',
			'\t\tLine 2',
			'\tLine 3'
		];
		expect(dedentLines(lines)).toEqual([
			'Line 1',
			'\tLine 2',
			'Line 3'
		]);
	});
});
