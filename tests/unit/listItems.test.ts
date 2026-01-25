import { describe, it, expect } from 'vitest';
import {
	buildLineToItemMap,
	isDescendantOf,
	getListItemAtLine,
	stripListPrefix
} from '../../src/utils/listItems';
import type { ListItem } from '../../src/types';

describe('buildLineToItemMap', () => {
	it('should create map from listItems', () => {
		const listItems: ListItem[] = [
			{
				position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 10, offset: 10 } },
				parent: -1
			},
			{
				position: { start: { line: 2, col: 2, offset: 20 }, end: { line: 2, col: 15, offset: 35 } },
				parent: 0
			}
		];

		const map = buildLineToItemMap(listItems);
		expect(map.size).toBe(2);
		expect(map.get(0)).toBe(listItems[0]);
		expect(map.get(2)).toBe(listItems[1]);
	});

	it('should handle empty list', () => {
		const map = buildLineToItemMap([]);
		expect(map.size).toBe(0);
	});

	it('should skip items without position', () => {
		const listItems: any[] = [
			{ position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 10, offset: 10 } }, parent: -1 },
			{ parent: 0 } // No position
		];

		const map = buildLineToItemMap(listItems);
		expect(map.size).toBe(1);
	});
});

describe('getListItemAtLine', () => {
	const listItems: ListItem[] = [
		{
			position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 10, offset: 10 } },
			parent: -1
		},
		{
			position: { start: { line: 2, col: 2, offset: 20 }, end: { line: 2, col: 15, offset: 35 } },
			parent: 0
		}
	];

	it('should find item at line', () => {
		expect(getListItemAtLine(listItems, 0)).toBe(listItems[0]);
		expect(getListItemAtLine(listItems, 2)).toBe(listItems[1]);
	});

	it('should return null if not found', () => {
		expect(getListItemAtLine(listItems, 5)).toBeNull();
	});

	it('should handle empty list', () => {
		expect(getListItemAtLine([], 0)).toBeNull();
	});
});

describe('isDescendantOf', () => {
	it('should return true for direct child', () => {
		const lineToItem = new Map<number, ListItem>([
			[0, { position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 10, offset: 10 } }, parent: -1 }],
			[1, { position: { start: { line: 1, col: 2, offset: 12 }, end: { line: 1, col: 20, offset: 30 } }, parent: 0 }]
		]);

		const child = lineToItem.get(1)!;
		expect(isDescendantOf(child, 0, lineToItem)).toBe(true);
	});

	it('should return true for grandchild', () => {
		const lineToItem = new Map<number, ListItem>([
			[0, { position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 10, offset: 10 } }, parent: -1 }],
			[1, { position: { start: { line: 1, col: 2, offset: 12 }, end: { line: 1, col: 20, offset: 30 } }, parent: 0 }],
			[2, { position: { start: { line: 2, col: 4, offset: 34 }, end: { line: 2, col: 25, offset: 55 } }, parent: 1 }]
		]);

		const grandchild = lineToItem.get(2)!;
		expect(isDescendantOf(grandchild, 0, lineToItem)).toBe(true);
	});

	it('should return false for sibling', () => {
		const lineToItem = new Map<number, ListItem>([
			[0, { position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 10, offset: 10 } }, parent: -1 }],
			[1, { position: { start: { line: 1, col: 0, offset: 12 }, end: { line: 1, col: 15, offset: 27 } }, parent: -1 }]
		]);

		const sibling = lineToItem.get(1)!;
		expect(isDescendantOf(sibling, 0, lineToItem)).toBe(false);
	});

	it('should return false for parent itself', () => {
		const lineToItem = new Map<number, ListItem>([
			[0, { position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 10, offset: 10 } }, parent: -1 }]
		]);

		const parent = lineToItem.get(0)!;
		expect(isDescendantOf(parent, 0, lineToItem)).toBe(false);
	});
});

describe('stripListPrefix', () => {
	it('should strip simple bullet', () => {
		expect(stripListPrefix('- Foo')).toBe('Foo');
		expect(stripListPrefix('* Bar')).toBe('Bar');
		expect(stripListPrefix('+ Baz')).toBe('Baz');
	});

	it('should strip bullet with indentation', () => {
		expect(stripListPrefix('  - Foo')).toBe('Foo');
		expect(stripListPrefix('\t* Bar')).toBe('Bar');
	});

	it('should strip checkbox', () => {
		expect(stripListPrefix('- [ ] Task')).toBe('Task');
		expect(stripListPrefix('- [x] Done')).toBe('Done');
		expect(stripListPrefix('- [o] Meeting')).toBe('Meeting');
	});

	it('should strip indented checkbox', () => {
		expect(stripListPrefix('  - [ ] Task')).toBe('Task');
	});

	it('should handle no prefix', () => {
		expect(stripListPrefix('Plain text')).toBe('Plain text');
	});

	it('should handle multiple spaces after bullet', () => {
		expect(stripListPrefix('-   Foo')).toBe('Foo');
	});

	it('should preserve content after checkbox', () => {
		expect(stripListPrefix('- [x] Completed task with details')).toBe('Completed task with details');
	});
});
