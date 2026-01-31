import { describe, it, expect } from 'vitest';
import { countIndent, indentLines, dedentLines } from '../../src/utils/indent';

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

describe('indentLines', () => {
	it('should add spaces to each line', () => {
		const lines = ['Line 1', 'Line 2'];
		expect(indentLines(lines, 4)).toEqual(['    Line 1', '    Line 2']);
	});

	it('should preserve existing indentation', () => {
		const lines = ['Line 1', '  Indented'];
		expect(indentLines(lines, 4)).toEqual(['    Line 1', '      Indented']);
	});

	it('should skip blank lines', () => {
		const lines = ['Line 1', '', 'Line 2'];
		expect(indentLines(lines, 4)).toEqual(['    Line 1', '', '    Line 2']);
	});

	it('should return copy for zero amount', () => {
		const lines = ['Line 1'];
		expect(indentLines(lines, 0)).toEqual(['Line 1']);
	});

	it('should handle empty input', () => {
		expect(indentLines([], 4)).toEqual([]);
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
