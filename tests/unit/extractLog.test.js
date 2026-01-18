import { describe, it, expect } from 'vitest';

const extractLog = require('../../scripts/extractLog.js');

describe('countIndent', () => {
  it('counts spaces correctly', () => {
    expect(extractLog.countIndent('    hello')).toBe(4);
  });

  it('counts tabs correctly', () => {
    expect(extractLog.countIndent('\t\thello')).toBe(2);
  });

  it('returns 0 for no indent', () => {
    expect(extractLog.countIndent('hello')).toBe(0);
  });

  it('stops at first non-whitespace character', () => {
    expect(extractLog.countIndent('  a  b')).toBe(2);
  });

  it('counts mixed tabs and spaces', () => {
    expect(extractLog.countIndent('\t  hello')).toBe(3);
  });

  it('returns 0 for empty string', () => {
    expect(extractLog.countIndent('')).toBe(0);
  });

  it('returns full length for whitespace-only string', () => {
    expect(extractLog.countIndent('    ')).toBe(4);
    expect(extractLog.countIndent('\t\t')).toBe(2);
  });
});
