/**
 * Utilities for working with tasks in markdown.
 */

import { countIndent } from './indent';

/**
 * Check if a line is an incomplete task.
 *
 * Matches:
 * - Open tasks: "- [ ]"
 * - Started tasks: "- [/]"
 *
 * @param line - The line to check
 * @returns true if the line is an incomplete task
 */
export function isIncompleteTask(line: string): boolean {
	// Match both open tasks [ ] and started tasks [/]
	return /^\s*- \[[ /]\]/.test(line);
}

/**
 * Remove a specific amount of indent from all lines.
 *
 * @param lines - Lines to dedent
 * @param amount - Number of characters to remove from the start of each line
 * @returns Dedented lines
 */
export function dedentLinesByAmount(lines: string[], amount: number): string[] {
	if (!lines || lines.length === 0 || amount <= 0) return lines.slice();

	return lines.map(line => {
		if (line.trim() === '') return '';
		const indent = countIndent(line);
		const toRemove = Math.min(indent, amount);
		return line.slice(toRemove);
	});
}

/**
 * Find all top-level incomplete tasks within a line range.
 *
 * "Top-level" means tasks that are not children of other tasks.
 *
 * @param editor - Editor object with getLine method
 * @param listItems - List items from metadataCache
 * @param startLine - Start of selection range (inclusive)
 * @param endLine - End of selection range (inclusive)
 * @returns Array of line numbers for top-level incomplete tasks
 */
export function findTopLevelTasksInRange(
	editor: { getLine: (line: number) => string },
	listItems: any[],
	startLine: number,
	endLine: number
): number[] {
	if (!listItems || listItems.length === 0) return [];

	// Build line-to-item map
	const lineToItem = new Map<number, any>();
	for (const li of listItems) {
		if (li.position && li.position.start && typeof li.position.start.line === 'number') {
			lineToItem.set(li.position.start.line, li);
		}
	}

	// Find all incomplete tasks in the range
	const tasksInRange: Array<{ line: number; item: any }> = [];
	for (const li of listItems) {
		if (!li.position || !li.position.start) continue;
		const line = li.position.start.line;

		// Check if in range
		if (line < startLine || line > endLine) continue;

		// Check if it's an incomplete task
		const lineText = editor.getLine(line);
		if (!isIncompleteTask(lineText)) continue;

		tasksInRange.push({ line, item: li });
	}

	// Filter to only top-level tasks (not children of other incomplete tasks)
	const topLevelTasks: number[] = [];
	for (const { line, item } of tasksInRange) {
		// A task is top-level if it has no parent that is an incomplete task
		let isChild = false;

		// Check if any ancestor is an incomplete task
		let parentLine = item.parent;
		while (typeof parentLine === 'number' && parentLine >= 0) {
			const parentText = editor.getLine(parentLine);
			if (isIncompleteTask(parentText)) {
				isChild = true;
				break;
			}
			const parentItem = lineToItem.get(parentLine);
			if (!parentItem) break;
			parentLine = parentItem.parent;
		}

		if (!isChild) {
			topLevelTasks.push(line);
		}
	}

	return topLevelTasks;
}

/**
 * Insert content under ## Log heading, creating it if necessary.
 *
 * @param content - Full file content
 * @param taskContent - Content to insert
 * @returns Updated file content
 */
export function insertUnderLogHeading(content: string, taskContent: string): string {
	const lines = content.split('\n');

	// Find ## Log heading
	let logLineIdx = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].match(/^## Log\s*$/)) {
			logLineIdx = i;
			break;
		}
	}

	if (logLineIdx >= 0) {
		// Insert after the heading
		lines.splice(logLineIdx + 1, 0, taskContent);
		return lines.join('\n');
	}

	// Need to create ## Log heading
	// Find where to insert (after frontmatter if present)
	let insertIdx = 0;

	// Check for frontmatter
	if (lines[0] === '---') {
		for (let i = 1; i < lines.length; i++) {
			if (lines[i] === '---') {
				insertIdx = i + 1;
				break;
			}
		}
	}

	// Insert ## Log heading and task
	const newContent = ['## Log', taskContent];
	lines.splice(insertIdx, 0, ...newContent);
	return lines.join('\n');
}
