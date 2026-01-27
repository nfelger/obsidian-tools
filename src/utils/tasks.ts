/**
 * Utilities for working with tasks in markdown.
 */

import { countIndent } from './indent';
import { INCOMPLETE_TASK_PATTERN, MIGRATE_TASK_PATTERN, SCHEDULED_MARKER } from '../config';
import { DEFAULT_SETTINGS } from '../types';

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
	return INCOMPLETE_TASK_PATTERN.test(line);
}

/**
 * Mark a task as scheduled by replacing checkbox with [<].
 *
 * @param line - The task line to mark
 * @returns The line with [<] marker, or unchanged if not an incomplete task
 */
export function markTaskAsScheduled(line: string): string {
	if (!INCOMPLETE_TASK_PATTERN.test(line)) {
		return line;
	}
	return line.replace(MIGRATE_TASK_PATTERN, `$1${SCHEDULED_MARKER}`);
}

/**
 * Parse a target section heading to extract level and text.
 *
 * @param heading - The heading string (e.g., "## Log", "### Inbox")
 * @returns Object with level (number of #) and text (heading without #)
 */
export function parseTargetHeading(heading: string): { level: number; text: string } {
	const match = heading.match(/^(#+)\s*(.*)$/);
	if (!match) {
		// Fallback to default if invalid
		return { level: 2, text: 'Log' };
	}
	return {
		level: match[1].length,
		text: match[2].trim()
	};
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
 * Insert content under target heading, creating it if necessary.
 *
 * @param content - Full file content
 * @param taskContent - Content to insert
 * @param targetHeading - The target heading to use (e.g., "## Log")
 * @returns Updated file content
 */
export function insertUnderTargetHeading(
	content: string,
	taskContent: string,
	targetHeading: string = DEFAULT_SETTINGS.targetSectionHeading
): string {
	const lines = content.split('\n');
	const { level, text } = parseTargetHeading(targetHeading);

	// Build regex to find the heading
	const headingRegex = new RegExp(`^${'#'.repeat(level)} ${text}\\s*$`);

	// Find target heading
	let targetLineIdx = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].match(headingRegex)) {
			targetLineIdx = i;
			break;
		}
	}

	if (targetLineIdx >= 0) {
		// Insert after the heading
		lines.splice(targetLineIdx + 1, 0, taskContent);
		return lines.join('\n');
	}

	// Need to create target heading
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

	// Insert target heading and task
	const newContent = [targetHeading, taskContent];
	lines.splice(insertIdx, 0, ...newContent);
	return lines.join('\n');
}
