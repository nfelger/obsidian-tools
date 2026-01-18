import { describe, it, expect } from 'vitest';

const { countIndent } = require('../../scripts/extractLog.js');

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
