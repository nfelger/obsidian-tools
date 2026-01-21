import { describe, it, expect } from 'vitest';

const { countIndent, dedentLines, stripListPrefix, stripWikiLinksToDisplayText, buildLineToItemMap, isPureLinkBullet, getListItemAtLine, isDescendantOf } = require('../../scripts/extractLog.js');

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

describe('buildLineToItemMap', () => {
  it('builds map from valid list items', () => {
    const listItems = [
      { position: { start: { line: 0 } }, parent: -1 },
      { position: { start: { line: 1 } }, parent: 0 },
      { position: { start: { line: 3 } }, parent: 0 }
    ];

    const map = buildLineToItemMap(listItems);

    expect(map.size).toBe(3);
    expect(map.get(0)).toEqual(listItems[0]);
    expect(map.get(1)).toEqual(listItems[1]);
    expect(map.get(3)).toEqual(listItems[2]);
    expect(map.get(2)).toBeUndefined();
  });

  it('returns empty map for null input', () => {
    const map = buildLineToItemMap(null);
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(0);
  });

  it('returns empty map for undefined input', () => {
    const map = buildLineToItemMap(undefined);
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(0);
  });

  it('returns empty map for empty array', () => {
    const map = buildLineToItemMap([]);
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(0);
  });

  it('skips items without position', () => {
    const listItems = [
      { position: { start: { line: 0 } } },
      { parent: 0 }, // no position
      { position: { start: { line: 2 } } }
    ];

    const map = buildLineToItemMap(listItems);
    expect(map.size).toBe(2);
    expect(map.get(0)).toBeDefined();
    expect(map.get(2)).toBeDefined();
  });

  it('skips items without position.start', () => {
    const listItems = [
      { position: { start: { line: 0 } } },
      { position: { end: { line: 1 } } }, // no start
      { position: { start: { line: 2 } } }
    ];

    const map = buildLineToItemMap(listItems);
    expect(map.size).toBe(2);
  });

  it('skips items with non-number line values', () => {
    const listItems = [
      { position: { start: { line: 0 } } },
      { position: { start: { line: '1' } } }, // string instead of number
      { position: { start: { line: null } } },
      { position: { start: { line: 3 } } }
    ];

    const map = buildLineToItemMap(listItems);
    expect(map.size).toBe(2);
    expect(map.get(0)).toBeDefined();
    expect(map.get(3)).toBeDefined();
  });
});

describe('isPureLinkBullet', () => {
  it('returns true for pure link bullet', () => {
    const firstLink = { matchText: '[[Note]]' };
    expect(isPureLinkBullet('- [[Note]]', firstLink)).toBe(true);
  });

  it('returns true for pure link bullet with checkbox', () => {
    const firstLink = { matchText: '[[Note]]' };
    expect(isPureLinkBullet('- [ ] [[Note]]', firstLink)).toBe(true);
    expect(isPureLinkBullet('- [x] [[Note]]', firstLink)).toBe(true);
  });

  it('returns true for pure link with different bullets', () => {
    const firstLink = { matchText: '[[Note]]' };
    expect(isPureLinkBullet('* [[Note]]', firstLink)).toBe(true);
    expect(isPureLinkBullet('+ [[Note]]', firstLink)).toBe(true);
  });

  it('returns true for pure link with extra whitespace', () => {
    const firstLink = { matchText: '[[Note]]' };
    expect(isPureLinkBullet('-   [[Note]]  ', firstLink)).toBe(true);
  });

  it('returns false when firstLink is null', () => {
    expect(isPureLinkBullet('- [[Note]]', null)).toBe(false);
  });

  it('returns false when firstLink is undefined', () => {
    expect(isPureLinkBullet('- [[Note]]', undefined)).toBe(false);
  });

  it('returns false for link with text after', () => {
    const firstLink = { matchText: '[[Note]]' };
    expect(isPureLinkBullet('- [[Note]] extra text', firstLink)).toBe(false);
  });

  it('returns false for link with text before', () => {
    const firstLink = { matchText: '[[Note]]' };
    expect(isPureLinkBullet('- prefix [[Note]]', firstLink)).toBe(false);
  });

  it('returns false for multiple links', () => {
    const firstLink = { matchText: '[[Note1]]' };
    expect(isPureLinkBullet('- [[Note1]] [[Note2]]', firstLink)).toBe(false);
  });

  it('returns false for embedded image link', () => {
    const firstLink = { matchText: '[[Note]]' };
    // Has both an image and a link
    expect(isPureLinkBullet('- ![[Image]] [[Note]]', firstLink)).toBe(false);
  });

  it('returns false when stripped text does not match', () => {
    const firstLink = { matchText: '[[Different]]' };
    expect(isPureLinkBullet('- [[Note]]', firstLink)).toBe(false);
  });
});

describe('getListItemAtLine', () => {
  it('finds item at specific line', () => {
    const listItems = [
      { position: { start: { line: 0 } }, id: 'item0' },
      { position: { start: { line: 2 } }, id: 'item2' },
      { position: { start: { line: 5 } }, id: 'item5' }
    ];

    const result = getListItemAtLine(listItems, 2);
    expect(result).toEqual({ position: { start: { line: 2 } }, id: 'item2' });
  });

  it('returns null for line not found', () => {
    const listItems = [
      { position: { start: { line: 0 } } },
      { position: { start: { line: 2 } } }
    ];

    expect(getListItemAtLine(listItems, 1)).toBeNull();
    expect(getListItemAtLine(listItems, 10)).toBeNull();
  });

  it('returns null for null listItems', () => {
    expect(getListItemAtLine(null, 0)).toBeNull();
  });

  it('returns null for undefined listItems', () => {
    expect(getListItemAtLine(undefined, 0)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(getListItemAtLine([], 0)).toBeNull();
  });

  it('skips items without position', () => {
    const listItems = [
      { id: 'no-position' },
      { position: { start: { line: 1 } }, id: 'item1' }
    ];

    expect(getListItemAtLine(listItems, 1)).toEqual({
      position: { start: { line: 1 } },
      id: 'item1'
    });
  });

  it('skips items without position.start', () => {
    const listItems = [
      { position: { end: { line: 0 } } },
      { position: { start: { line: 1 } }, id: 'item1' }
    ];

    expect(getListItemAtLine(listItems, 1)).toEqual({
      position: { start: { line: 1 } },
      id: 'item1'
    });
  });

  it('returns first item if multiple items at same line', () => {
    const listItems = [
      { position: { start: { line: 0 } }, id: 'first' },
      { position: { start: { line: 0 } }, id: 'second' }
    ];

    const result = getListItemAtLine(listItems, 0);
    expect(result.id).toBe('first');
  });
});

describe('isDescendantOf', () => {
  it('returns true for direct child', () => {
    const item = { parent: 0 };
    const lineToItem = new Map();

    expect(isDescendantOf(item, 0, lineToItem)).toBe(true);
  });

  it('returns true for indirect descendant (grandchild)', () => {
    const grandchild = { parent: 2 };
    const child = { parent: 0 };
    const lineToItem = new Map([
      [2, child]
    ]);

    expect(isDescendantOf(grandchild, 0, lineToItem)).toBe(true);
  });

  it('returns true for deep nesting', () => {
    const item = { parent: 4 };
    const lineToItem = new Map([
      [4, { parent: 3 }],
      [3, { parent: 2 }],
      [2, { parent: 1 }],
      [1, { parent: 0 }]
    ]);

    expect(isDescendantOf(item, 0, lineToItem)).toBe(true);
  });

  it('returns false when not a descendant', () => {
    const item = { parent: 5 };
    const lineToItem = new Map([
      [5, { parent: 4 }],
      [4, { parent: -1 }]
    ]);

    expect(isDescendantOf(item, 0, lineToItem)).toBe(false);
  });

  it('returns false when item has no parent', () => {
    const item = { parent: -1 };
    const lineToItem = new Map();

    expect(isDescendantOf(item, 0, lineToItem)).toBe(false);
  });

  it('returns false when item parent is non-number', () => {
    const item = { parent: null };
    const lineToItem = new Map();

    expect(isDescendantOf(item, 0, lineToItem)).toBe(false);
  });

  it('returns false when item parent is undefined', () => {
    const item = {};
    const lineToItem = new Map();

    expect(isDescendantOf(item, 0, lineToItem)).toBe(false);
  });

  it('stops when parent not found in lineToItem map', () => {
    const item = { parent: 2 };
    const lineToItem = new Map(); // empty map

    expect(isDescendantOf(item, 0, lineToItem)).toBe(false);
  });

  it('handles partial parent chain', () => {
    const item = { parent: 3 };
    const lineToItem = new Map([
      [3, { parent: 2 }]
      // parent 2 is not in the map
    ]);

    expect(isDescendantOf(item, 0, lineToItem)).toBe(false);
  });

  it('returns false when checking if ancestor is descendant of itself', () => {
    const item = { parent: -1 };
    const lineToItem = new Map();

    expect(isDescendantOf(item, 0, lineToItem)).toBe(false);
  });
});
