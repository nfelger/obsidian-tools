/**
 * Pure functions for auto-moving completed tasks from Todo to Log.
 *
 * All functions operate on plain strings/arrays — no Obsidian or CM6 dependencies.
 */

import { findSectionRange, parseTargetHeading } from './tasks';
import { countIndent } from './indent';

const COMPLETED_TASK_PATTERN = /^\s*- \[x\]/i;
const LIST_ITEM_PATTERN = /^\s*[-*+]\s/;

/**
 * Find the root ancestor of a line within a section, walking up by indentation.
 *
 * @param lines - All document lines
 * @param taskLine - Line number of the completed task
 * @param sectionStart - Line number of the section heading
 * @returns Line number of the root ancestor (may be taskLine itself)
 */
export function findRootAncestorLine(
	lines: string[],
	taskLine: number,
	sectionStart: number
): number {
	const taskIndent = countIndent(lines[taskLine]);
	let root = taskLine;

	for (let i = taskLine - 1; i > sectionStart; i--) {
		const line = lines[i];
		if (line.trim() === '') continue;

		const indent = countIndent(line);
		if (indent < countIndent(lines[root])) {
			root = i;
			if (indent === 0) break;
		}
	}

	return root;
}

/**
 * Collect a block of lines starting at rootLine, including all children.
 * Children are lines with greater indentation than root. Blank lines between
 * children are included; trailing blank lines are not.
 *
 * @param lines - All document lines
 * @param rootLine - First line of the block
 * @param sectionEnd - Exclusive end of the section
 * @returns Start (inclusive) and end (exclusive) line numbers
 */
export function collectBlock(
	lines: string[],
	rootLine: number,
	sectionEnd: number
): { startLine: number; endLine: number } {
	const rootIndent = countIndent(lines[rootLine]);
	let endLine = rootLine + 1;

	while (endLine < sectionEnd) {
		const line = lines[endLine];

		if (line.trim() === '') {
			// Blank line — include only if followed by a child
			let nextNonBlank = endLine + 1;
			while (nextNonBlank < sectionEnd && lines[nextNonBlank].trim() === '') {
				nextNonBlank++;
			}
			if (nextNonBlank < sectionEnd && countIndent(lines[nextNonBlank]) > rootIndent) {
				endLine = nextNonBlank + 1;
				continue;
			}
			break;
		}

		if (countIndent(line) > rootIndent) {
			endLine++;
		} else {
			break;
		}
	}

	return { startLine: rootLine, endLine };
}

/**
 * Find the line where content should be inserted in the Log section.
 * Inserts before the first blank line among list items. If no blank line,
 * appends after the last list item. If no list items, inserts after the heading.
 *
 * @param lines - All document lines
 * @param logStart - Line number of the Log heading
 * @param logEnd - Exclusive end of the Log section
 * @returns Line number where new content should be inserted
 */
export function findLogInsertionLine(
	lines: string[],
	logStart: number,
	logEnd: number
): number {
	let lastListItemLine = -1;

	for (let i = logStart + 1; i < logEnd; i++) {
		const line = lines[i];

		if (line.trim() === '') {
			// Blank line — if we've seen list items before, insert here
			if (lastListItemLine >= 0) {
				return i;
			}
			// Blank line before any list items — insert before it
			// (this handles "heading, blank, future items" case)
			const hasItemsAfter = lines.slice(i + 1, logEnd).some(l => LIST_ITEM_PATTERN.test(l));
			if (hasItemsAfter) {
				return i;
			}
			continue;
		}

		if (LIST_ITEM_PATTERN.test(line) || countIndent(line) > 0) {
			lastListItemLine = i;
		}
	}

	if (lastListItemLine >= 0) {
		return lastListItemLine + 1;
	}

	return logStart + 1;
}

/**
 * Compute the changes needed to move a completed task from Todo to Log.
 *
 * @param docText - Full document text
 * @param completedLine - Line number of the just-completed task
 * @param todoHeading - The Todo section heading (e.g., "## Todo")
 * @param logHeading - The Log section heading (e.g., "## Log")
 * @returns Array of CM6-compatible changes (sorted by position), or null if no move needed
 */
export function computeAutoMove(
	docText: string,
	completedLine: number,
	todoHeading: string,
	logHeading: string
): { changes: Array<{ from: number; to: number; insert: string }> } | null {
	const lines = docText.split('\n');

	// Check that the completed line is a completed task
	if (completedLine < 0 || completedLine >= lines.length) return null;
	if (!COMPLETED_TASK_PATTERN.test(lines[completedLine])) return null;

	// Find Todo section and verify the line is in it
	const todoRange = findSectionRange(lines, todoHeading);
	if (!todoRange) return null;
	if (completedLine <= todoRange.start || completedLine >= todoRange.end) return null;

	// Find root ancestor and collect the block
	const rootLine = findRootAncestorLine(lines, completedLine, todoRange.start);
	const block = collectBlock(lines, rootLine, todoRange.end);
	const blockText = lines.slice(block.startLine, block.endLine).join('\n');

	// Find Log section (may not exist yet)
	const logRange = findSectionRange(lines, logHeading);

	// Calculate character offsets for delete
	const docLength = docText.length;
	const deleteFrom = lineToOffset(lines, block.startLine, docLength);
	const deleteTo = lineToOffset(lines, block.endLine, docLength);

	if (logRange) {
		// Log exists — find insertion point
		const insertLine = findLogInsertionLine(lines, logRange.start, logRange.end);
		const insertOffset = lineToOffset(lines, insertLine, docLength);

		// Ensure insertion starts on its own line
		const needsNewlineBefore = insertOffset > 0 && docText[insertOffset - 1] !== '\n';
		const insertContent = (needsNewlineBefore ? '\n' : '') + blockText + '\n';

		const changes: Array<{ from: number; to: number; insert: string }> = [];
		changes.push({ from: deleteFrom, to: deleteTo, insert: '' });
		changes.push({ from: insertOffset, to: insertOffset, insert: insertContent });

		// Sort by position (required by CM6)
		changes.sort((a, b) => a.from - b.from);
		return { changes };
	} else {
		// Log doesn't exist — create at end of file
		const eof = docLength;
		const needsLeadingNewline = eof > 0 && docText[eof - 1] !== '\n';
		const logContent = (needsLeadingNewline ? '\n' : '') + logHeading + '\n' + blockText + '\n';

		const changes: Array<{ from: number; to: number; insert: string }> = [];
		changes.push({ from: deleteFrom, to: deleteTo, insert: '' });
		changes.push({ from: eof, to: eof, insert: logContent });

		// Sort by position
		changes.sort((a, b) => a.from - b.from);
		return { changes };
	}
}

/**
 * Convert a line number to a character offset in the document.
 * When lineNum >= lines.length, returns docLength (end of document).
 */
function lineToOffset(lines: string[], lineNum: number, docLength: number): number {
	if (lineNum >= lines.length) return docLength;
	let offset = 0;
	for (let i = 0; i < lineNum; i++) {
		offset += lines[i].length + 1; // +1 for newline
	}
	return offset;
}
