/**
 * Utilities for automatically moving completed tasks from ## Todo to ## Log
 * in daily notes.
 *
 * When a task (or any of its children) is marked [x] in ## Todo, the entire
 * top-level task block is moved to ## Log. The block is inserted before the
 * first blank line in the log's list items, allowing the user to separate
 * "already happened" items from "future" items with a blank line.
 */

import { countIndent } from './indent';
import { parseTargetHeading } from './tasks';

const COMPLETED_TASK_PATTERN = /^\s*- \[x\]/i;
const LIST_ITEM_PATTERN = /^\s*[-*+]\s/;

export interface SectionRange {
	headingLine: number;
	contentStart: number;
	contentEnd: number;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find the range of a markdown section by its heading.
 *
 * Returns the heading line, content start (line after heading),
 * and content end (first line of next same-or-higher-level heading, or EOF).
 */
export function findSectionRange(lines: string[], heading: string): SectionRange | null {
	const { level, text } = parseTargetHeading(heading);
	const headingRegex = new RegExp(`^${'#'.repeat(level)}\\s+${escapeRegex(text)}\\s*$`);

	let headingLine = -1;
	for (let i = 0; i < lines.length; i++) {
		if (headingRegex.test(lines[i])) {
			headingLine = i;
			break;
		}
	}

	if (headingLine < 0) return null;

	const headingPattern = /^(#{1,6})\s/;
	let contentEnd = lines.length;
	for (let i = headingLine + 1; i < lines.length; i++) {
		const match = lines[i].match(headingPattern);
		if (match && match[1].length <= level) {
			contentEnd = i;
			break;
		}
	}

	return {
		headingLine,
		contentStart: headingLine + 1,
		contentEnd
	};
}

/**
 * Find the first line with a completed [x] task in a section.
 * Returns -1 if none found.
 */
export function findFirstCompletedTaskInSection(
	lines: string[],
	section: SectionRange
): number {
	for (let i = section.contentStart; i < section.contentEnd; i++) {
		if (COMPLETED_TASK_PATTERN.test(lines[i])) {
			return i;
		}
	}
	return -1;
}

/**
 * Find the top-level ancestor of a task within a section.
 *
 * Walks upward from the task line, looking for less-indented lines.
 * Stops at blank lines (which separate top-level blocks) or at
 * the section boundary.
 */
export function findTopLevelAncestor(
	lines: string[],
	taskLine: number,
	sectionContentStart: number
): number {
	let topLevel = taskLine;
	let topLevelIndent = countIndent(lines[taskLine]);

	for (let i = taskLine - 1; i >= sectionContentStart; i--) {
		const line = lines[i];

		if (line.trim() === '') break;

		const indent = countIndent(line);
		if (indent < topLevelIndent) {
			topLevel = i;
			topLevelIndent = indent;
		}

		if (topLevelIndent === 0) break;
	}

	return topLevel;
}

/**
 * Extract a task block starting from a top-level line.
 *
 * Includes the top-level line and all contiguous more-indented lines
 * below it (children). Stops at blank lines or same/less-indented lines.
 */
export function extractTaskBlock(
	lines: string[],
	topLevelLine: number,
	sectionEndLine: number
): { blockLines: string[]; startLine: number; endLine: number } {
	const topLevelIndent = countIndent(lines[topLevelLine]);
	let endLine = topLevelLine + 1;

	while (endLine < sectionEndLine) {
		const line = lines[endLine];
		if (line.trim() === '' || countIndent(line) <= topLevelIndent) {
			break;
		}
		endLine++;
	}

	return {
		blockLines: lines.slice(topLevelLine, endLine),
		startLine: topLevelLine,
		endLine
	};
}

/**
 * Find the insertion point in the Log section.
 *
 * The completed task is inserted before the first blank line that appears
 * after list items have started. This lets the user separate "already
 * happened" items from "future" items with a blank line.
 *
 * Fallbacks:
 * - No blank line among list items → after the last list item
 * - Empty log (no list items) → after the heading
 */
export function findLogInsertionPoint(
	lines: string[],
	logSection: SectionRange
): number {
	let foundListItem = false;

	for (let i = logSection.contentStart; i < logSection.contentEnd; i++) {
		const line = lines[i];

		if (LIST_ITEM_PATTERN.test(line)) {
			foundListItem = true;
		} else if (line.trim() === '' && foundListItem) {
			return i;
		}
	}

	if (foundListItem) {
		for (let i = logSection.contentEnd - 1; i >= logSection.contentStart; i--) {
			if (LIST_ITEM_PATTERN.test(lines[i])) {
				return i + 1;
			}
		}
	}

	return logSection.contentStart;
}

/**
 * Move the first completed task block from a Todo section to a Log section.
 *
 * Finds the first [x] task in ## Todo, walks up to its top-level ancestor,
 * extracts the full block (parent + children), removes it from Todo, and
 * inserts it into Log before the first blank line among the log's list items.
 *
 * Returns the updated content, or null if no move is needed.
 */
export function moveCompletedTodoToLog(
	content: string,
	todoHeading: string = '## Todo',
	logHeading: string = '## Log'
): string | null {
	const lines = content.split('\n');

	const todoSection = findSectionRange(lines, todoHeading);
	if (!todoSection) return null;

	const completedLine = findFirstCompletedTaskInSection(lines, todoSection);
	if (completedLine < 0) return null;

	const topLevelLine = findTopLevelAncestor(lines, completedLine, todoSection.contentStart);
	const block = extractTaskBlock(lines, topLevelLine, todoSection.contentEnd);

	// Remove block from Todo
	const afterRemoval = [...lines];
	afterRemoval.splice(block.startLine, block.endLine - block.startLine);

	// Find Log in the modified content
	const logSection = findSectionRange(afterRemoval, logHeading);

	if (!logSection) {
		// Create Log heading and insert block at end of file
		afterRemoval.push('', logHeading, ...block.blockLines);
		return afterRemoval.join('\n');
	}

	const insertionPoint = findLogInsertionPoint(afterRemoval, logSection);
	afterRemoval.splice(insertionPoint, 0, ...block.blockLines);

	return afterRemoval.join('\n');
}

/**
 * Move ALL completed task blocks from Todo to Log in one pass.
 *
 * Repeatedly calls moveCompletedTodoToLog until no more completed tasks
 * remain in Todo. Returns the updated content, or null if no moves were needed.
 */
export function moveAllCompletedTodosToLog(
	content: string,
	todoHeading: string = '## Todo',
	logHeading: string = '## Log'
): string | null {
	let current = content;
	let anyMoved = false;

	let result = moveCompletedTodoToLog(current, todoHeading, logHeading);
	while (result !== null) {
		anyMoved = true;
		current = result;
		result = moveCompletedTodoToLog(current, todoHeading, logHeading);
	}

	return anyMoved ? current : null;
}
