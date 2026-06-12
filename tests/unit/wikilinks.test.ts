import { describe, it, expect } from 'vitest';
import { parseWikilinkText, stripWikilinksToDisplayText } from '../../src/utils/wikilinks';

describe('parseWikilinkText', () => {
	it('should parse simple link', () => {
		const result = parseWikilinkText('Note Name');
		expect(result).toEqual({
			linkPath: 'Note Name',
			section: null,
			alias: null
		});
	});

	it('should parse link with section', () => {
		const result = parseWikilinkText('Note#Section');
		expect(result).toEqual({
			linkPath: 'Note',
			section: 'Section',
			alias: null
		});
	});

	it('should parse link with alias', () => {
		const result = parseWikilinkText('Note|Display Text');
		expect(result).toEqual({
			linkPath: 'Note',
			section: null,
			alias: 'Display Text'
		});
	});

	it('should parse link with section and alias', () => {
		const result = parseWikilinkText('Note#Section|Display');
		expect(result).toEqual({
			linkPath: 'Note',
			section: 'Section',
			alias: 'Display'
		});
	});

	it('should handle multiple # in section', () => {
		const result = parseWikilinkText('Note#Section#Subsection');
		expect(result).toEqual({
			linkPath: 'Note',
			section: 'Section#Subsection',
			alias: null
		});
	});

	it('should handle multiple | in alias', () => {
		const result = parseWikilinkText('Note|Display|Text');
		expect(result).toEqual({
			linkPath: 'Note',
			section: null,
			alias: 'Display|Text'
		});
	});
});

describe('stripWikilinksToDisplayText', () => {
	it('should keep simple links as-is', () => {
		expect(stripWikilinksToDisplayText('[[Note]]')).toBe('Note');
	});

	it('should use alias if present', () => {
		expect(stripWikilinksToDisplayText('[[Note|Display]]')).toBe('Display');
	});

	it('should use section name if no alias', () => {
		expect(stripWikilinksToDisplayText('[[Note#Section]]')).toBe('Section');
	});

	it('should handle multiple wikilinks', () => {
		expect(stripWikilinksToDisplayText('See [[Note1]] and [[Note2|Link]]'))
			.toBe('See Note1 and Link');
	});

	it('should handle text without wikilinks', () => {
		expect(stripWikilinksToDisplayText('Plain text')).toBe('Plain text');
	});

	it('should preserve section with alias', () => {
		expect(stripWikilinksToDisplayText('[[Note#Section|Display]]')).toBe('Display');
	});
});
