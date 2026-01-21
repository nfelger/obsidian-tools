import { describe, it, expect } from 'vitest';

const { countIndent, dedentLines } = require('../../scripts/extractLog.js');

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
