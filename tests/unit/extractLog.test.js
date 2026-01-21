import { describe, it, expect } from 'vitest';

const { countIndent, dedentLines, stripListPrefix, stripWikiLinksToDisplayText } = require('../../scripts/extractLog.js');

describe('countIndent', () => {
  it('counts spaces correctly', () => {
    expect(countIndent('    hello')).toBe(4);
  });

  it('counts tabs correctly', () => {
    expect(countIndent('\t\thello')).toBe(2);
  });

  it('returns 0 for no indent', () => {
    expect(countIndent('hello')).toBe(0);
  });

  it('stops at first non-whitespace character', () => {
    expect(countIndent('  a  b')).toBe(2);
  });

  it('counts mixed tabs and spaces', () => {
    expect(countIndent('\t  hello')).toBe(3);
  });

  it('returns 0 for empty string', () => {
    expect(countIndent('')).toBe(0);
  });

  it('returns full length for whitespace-only string', () => {
    expect(countIndent('    ')).toBe(4);
    expect(countIndent('\t\t')).toBe(2);
  });
});

describe('dedentLines', () => {
  it('removes common leading indent', () => {
    const input = ['    line 1', '    line 2', '      nested'];
    const expected = ['line 1', 'line 2', '  nested'];
    expect(dedentLines(input)).toEqual(expected);
  });

  it('preserves empty lines', () => {
    const input = ['  a', '', '  b'];
    const expected = ['a', '', 'b'];
    expect(dedentLines(input)).toEqual(expected);
  });

  it('handles no common indent', () => {
    const input = ['a', 'b', 'c'];
    const expected = ['a', 'b', 'c'];
    expect(dedentLines(input)).toEqual(expected);
  });

  it('preserves relative indentation', () => {
    const input = ['  level 1', '    level 2', '      level 3'];
    const expected = ['level 1', '  level 2', '    level 3'];
    expect(dedentLines(input)).toEqual(expected);
  });

  it('handles mixed tabs and spaces', () => {
    const input = ['\t\tline 1', '\t\tline 2'];
    const expected = ['line 1', 'line 2'];
    expect(dedentLines(input)).toEqual(expected);
  });

  it('returns empty array for empty input', () => {
    expect(dedentLines([])).toEqual([]);
  });

  it('handles all blank lines (preserves whitespace)', () => {
    const input = ['', '  ', '\t'];
    // When all lines are blank, minIndent is null, so original array is returned
    expect(dedentLines(input)).toEqual(['', '  ', '\t']);
  });

  it('finds minimum indent from non-blank lines only', () => {
    const input = ['    line 1', '', '  line 2'];
    const expected = ['  line 1', '', 'line 2'];
    expect(dedentLines(input)).toEqual(expected);
  });
});

describe('stripListPrefix', () => {
  it('removes simple bullet', () => {
    expect(stripListPrefix('- Foo')).toBe('Foo');
  });

  it('removes bullet with leading whitespace', () => {
    expect(stripListPrefix('  - Foo')).toBe('Foo');
    expect(stripListPrefix('\t- Foo')).toBe('Foo');
  });

  it('removes bullet with unchecked checkbox', () => {
    expect(stripListPrefix('- [ ] Task')).toBe('Task');
    expect(stripListPrefix('  - [ ] Task')).toBe('Task');
  });

  it('removes bullet with checked checkbox', () => {
    expect(stripListPrefix('- [x] Done')).toBe('Done');
    expect(stripListPrefix('- [X] Done')).toBe('Done');
  });

  it('removes bullet with custom checkbox markers', () => {
    expect(stripListPrefix('- [o] Custom')).toBe('Custom');
    expect(stripListPrefix('- [-] Cancelled')).toBe('Cancelled');
    expect(stripListPrefix('- [>] Forwarded')).toBe('Forwarded');
  });

  it('handles different bullet types', () => {
    expect(stripListPrefix('* Item')).toBe('Item');
    expect(stripListPrefix('+ Item')).toBe('Item');
    expect(stripListPrefix('- Item')).toBe('Item');
  });

  it('preserves content without bullets', () => {
    expect(stripListPrefix('Just text')).toBe('Just text');
    expect(stripListPrefix('No bullet here')).toBe('No bullet here');
  });

  it('handles empty string', () => {
    expect(stripListPrefix('')).toBe('');
  });

  it('preserves content after list prefix', () => {
    expect(stripListPrefix('- Item with - dash')).toBe('Item with - dash');
  });

  it('handles multiple spaces after bullet', () => {
    expect(stripListPrefix('-  Multiple spaces')).toBe('Multiple spaces');
    expect(stripListPrefix('- [ ]  Multiple spaces')).toBe('Multiple spaces');
  });
});

describe('stripWikiLinksToDisplayText', () => {
  it('extracts page name from simple link', () => {
    expect(stripWikiLinksToDisplayText('[[Note]]')).toBe('Note');
    expect(stripWikiLinksToDisplayText('text [[Note]] more')).toBe('text Note more');
  });

  it('extracts section name from link with section', () => {
    expect(stripWikiLinksToDisplayText('[[Note#Section]]')).toBe('Section');
    expect(stripWikiLinksToDisplayText('[[Note#My Section]]')).toBe('My Section');
  });

  it('extracts alias from link with alias', () => {
    expect(stripWikiLinksToDisplayText('[[Note|Alias]]')).toBe('Alias');
    expect(stripWikiLinksToDisplayText('[[Note|My Alias]]')).toBe('My Alias');
  });

  it('extracts alias from link with section and alias', () => {
    expect(stripWikiLinksToDisplayText('[[Note#Section|Alias]]')).toBe('Alias');
  });

  it('handles multiple links in text', () => {
    expect(stripWikiLinksToDisplayText('[[Note1]] and [[Note2]]')).toBe('Note1 and Note2');
    expect(stripWikiLinksToDisplayText('[[A|Alias1]] to [[B#Sec]]')).toBe('Alias1 to Sec');
  });

  it('preserves text without links', () => {
    expect(stripWikiLinksToDisplayText('Just text')).toBe('Just text');
    expect(stripWikiLinksToDisplayText('No links here')).toBe('No links here');
  });

  it('handles empty string', () => {
    expect(stripWikiLinksToDisplayText('')).toBe('');
  });

  it('handles link with only section marker (no section text)', () => {
    expect(stripWikiLinksToDisplayText('[[Note#]]')).toBe('Note');
  });

  it('trims whitespace from extracted text', () => {
    expect(stripWikiLinksToDisplayText('[[ Note ]]')).toBe('Note');
    expect(stripWikiLinksToDisplayText('[[Note#Section ]]')).toBe('Section');
    expect(stripWikiLinksToDisplayText('[[Note| Alias ]]')).toBe('Alias');
  });

  it('handles complex nested pipes in alias', () => {
    // Multiple pipes - everything after first pipe is the alias
    expect(stripWikiLinksToDisplayText('[[Note|Alias|Extra]]')).toBe('Alias|Extra');
  });
});
