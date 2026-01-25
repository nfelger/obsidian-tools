import { describe, it, expect } from 'vitest';
import { parseWikilinkText, findWikilinkMatches, stripWikilinksToDisplayText } from '../../src/utils/wikilinks';

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

describe('findWikilinkMatches', () => {
	it('should find single wikilink', () => {
		const matches = findWikilinkMatches('Some text [[Note]] more text');
		expect(matches).toHaveLength(1);
		expect(matches[0]).toEqual({
			index: 10,
			matchText: '[[Note]]',
			inner: 'Note'
		});
	});

	it('should find multiple wikilinks', () => {
		const matches = findWikilinkMatches('[[Note1]] and [[Note2]]');
		expect(matches).toHaveLength(2);
		expect(matches[0].inner).toBe('Note1');
		expect(matches[1].inner).toBe('Note2');
	});

	it('should ignore embeds (![[ ]])', () => {
		const matches = findWikilinkMatches('Text ![[Embed]] and [[Link]]');
		expect(matches).toHaveLength(1);
		expect(matches[0].inner).toBe('Link');
	});

	it('should handle no matches', () => {
		const matches = findWikilinkMatches('No links here');
		expect(matches).toHaveLength(0);
	});

	it('should handle wikilinks with section', () => {
		const matches = findWikilinkMatches('[[Note#Section]]');
		expect(matches[0].inner).toBe('Note#Section');
	});

	it('should handle wikilinks with alias', () => {
		const matches = findWikilinkMatches('[[Note|Alias]]');
		expect(matches[0].inner).toBe('Note|Alias');
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
