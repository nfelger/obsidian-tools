import type { ListItem } from '../types';

/**
 * Regex for list prefix + optional checkbox:
 * - optional leading whitespace
 * - a bullet marker: -, *, or +
 * - at least one space
 * - optional checkbox: [x] where x is any non-[, non-] char
 * - trailing spaces after checkbox if present
 */
const LIST_PREFIX_RE = /^(\s*[-*+]\s+(\[[^\[\]]\]\s+)?)?/;

/**
 * Build a map from line numbers to list items.
 */
export function buildLineToItemMap(listItems: ListItem[]): Map<number, ListItem> {
	const map = new Map<number, ListItem>();
	if (!listItems) return map;

	for (const li of listItems) {
		if (!li.position || !li.position.start) continue;
		const line = li.position.start.line;
		if (typeof line === 'number') {
			map.set(line, li);
		}
	}
	return map;
}

/**
 * Find the list item at a specific line number.
 */
export function getListItemAtLine(listItems: ListItem[], line: number): ListItem | null {
	if (!listItems) return null;
	for (const li of listItems) {
		if (!li.position || !li.position.start) continue;
		if (li.position.start.line === line) return li;
	}
	return null;
}

/**
 * Check if an item is a descendant of a specific ancestor line.
 * Walks up the parent chain to check.
 */
export function isDescendantOf(
	item: ListItem,
	ancestorLine: number,
	lineToItem: Map<number, ListItem>
): boolean {
	let parentLine = item.parent;
	while (typeof parentLine === 'number' && parentLine >= 0) {
		if (parentLine === ancestorLine) return true;
		const parentItem = lineToItem.get(parentLine);
		if (!parentItem) break;
		parentLine = parentItem.parent;
	}
	return false;
}

/**
 * Strip leading bullet / task markers from a list line, keep the content.
 * Examples:
 *   "- Foo"           -> "Foo"
 *   "  - [ ] Bar"     -> "Bar"
 *   "  - [o] Baz"     -> "Baz"
 */
export function stripListPrefix(line: string): string {
	return line.replace(LIST_PREFIX_RE, '');
}

/**
 * Find all children of a parent list item.
 * Returns the start line, end line, and lines of text for the children block.
 */
export function findChildrenBlockFromListItems(
	editor: { getLine: (line: number) => string; lineCount: () => number; getRange: (from: {line: number, ch: number}, to: {line: number, ch: number}) => string },
	listItems: ListItem[],
	parentLine: number
): { startLine: number; endLine: number; lines: string[] } | null {
	if (!listItems || listItems.length === 0) return null;

	const parentItem = getListItemAtLine(listItems, parentLine);
	if (!parentItem) return null;

	const lineToItem = buildLineToItemMap(listItems);
	const childItems: ListItem[] = [];

	for (const li of listItems) {
		if (!li.position || !li.position.start || !li.position.end) continue;
		const startLine = li.position.start.line;
		if (typeof startLine !== 'number') continue;
		if (startLine <= parentLine) continue;
		if (isDescendantOf(li, parentLine, lineToItem)) {
			childItems.push(li);
		}
	}

	if (childItems.length === 0) return null;

	let minStart = Infinity;
	let maxEnd = -1;
	for (const ci of childItems) {
		const s = ci.position.start.line;
		const e = ci.position.end.line;
		if (s < minStart) minStart = s;
		if (e > maxEnd) maxEnd = e;
	}

	if (!isFinite(minStart) || maxEnd < minStart) return null;

	const endExclusive = Math.min(maxEnd + 1, editor.lineCount());
	const text = editor.getRange(
		{ line: minStart, ch: 0 },
		{ line: endExclusive, ch: 0 }
	);

	return {
		startLine: minStart,
		endLine: endExclusive,
		lines: text.split('\n')
	};
}
