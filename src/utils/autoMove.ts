/**
 * Pure functions for auto-moving completed and started tasks from Todo to Log.
 *
 * All functions operate on plain strings/arrays — no Obsidian or CM6 dependencies.
 */

import { findSectionRange, TaskMarker, TaskState } from './tasks';
import { countIndent } from './indent';

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
 * The block a trigger line belongs to: the trigger's root ancestor within its
 * section, plus that root's children.
 */
export interface AutoMoveBlock {
	/** Root ancestor of the trigger line — the first line of the block */
	rootLine: number;
	/** Exclusive end of the block */
	endLine: number;
}

/**
 * Locate the block a completed or started task belongs to, or null when the
 * line isn't a live trigger inside the given section.
 *
 * Callers that need to know *what* the block is before deciding what to do with
 * it (e.g. project auto-completion, which claims the trigger's children) use
 * this; computeAutoMove builds on it.
 *
 * @param docText - Full document text
 * @param triggerLine - Line number of the just-completed or just-started task
 * @param sectionHeading - The section the trigger sits in (e.g., "## Todo")
 */
export function findAutoMoveBlock(
	docText: string,
	triggerLine: number,
	sectionHeading: string
): AutoMoveBlock | null {
	const lines = docText.split('\n');

	// Check that the line is a completed or started task
	if (triggerLine < 0 || triggerLine >= lines.length) return null;
	const marker = TaskMarker.fromLine(lines[triggerLine]);
	if (!marker || (marker.state !== TaskState.Completed && marker.state !== TaskState.Started)) return null;

	// Verify the line is inside the section
	const range = findSectionRange(lines, sectionHeading);
	if (!range) return null;
	if (triggerLine <= range.start || triggerLine >= range.end) return null;

	// Find root ancestor and collect the block
	const rootLine = findRootAncestorLine(lines, triggerLine, range.start);
	const block = collectBlock(lines, rootLine, range.end);
	return { rootLine, endLine: block.endLine };
}

/**
 * Compute the changes needed to move a completed or started task from Todo to Log.
 *
 * @param docText - Full document text
 * @param triggerLine - Line number of the just-completed or just-started task
 * @param todoHeading - The Todo section heading (e.g., "## Todo")
 * @param logHeading - The Log section heading (e.g., "## Log")
 * @param options.moveLineOnly - File only the block's first line under Log and
 *   drop the rest of the block, for tasks whose children have already been
 *   written elsewhere (project auto-completion)
 * @returns Array of CM6-compatible changes (sorted by position), or null if no move needed
 */
export function computeAutoMove(
	docText: string,
	triggerLine: number,
	todoHeading: string,
	logHeading: string,
	options: { moveLineOnly?: boolean } = {}
): { changes: Array<{ from: number; to: number; insert: string }> } | null {
	const lines = docText.split('\n');

	const block = findAutoMoveBlock(docText, triggerLine, todoHeading);
	if (!block) return null;

	const blockText = options.moveLineOnly
		? lines[block.rootLine]
		: lines.slice(block.rootLine, block.endLine).join('\n');

	// Find Log section (may not exist yet)
	const logRange = findSectionRange(lines, logHeading);

	// Calculate character offsets for delete
	const docLength = docText.length;
	const deleteFrom = lineToOffset(lines, block.rootLine, docLength);
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
 * Find a completed task in a section by its exact line text.
 *
 * The counterpart to `findAutoMoveTriggerLine` for the Log section, where
 * completed tasks accumulate and "the first one" says nothing about which line
 * the user just ticked. Matching by text survives the line shifts that make a
 * captured line *number* unusable. Returns null when the text appears more
 * than once — which of the twins was ticked is unknowable, and guessing would
 * strip the wrong entry's notes.
 *
 * @param docText - Full document text
 * @param sectionHeading - The section to search (e.g., "## Log")
 * @param lineText - The line to find, matched in full including indentation
 * @returns Line number (0-indexed), or null if absent or ambiguous
 */
export function findCompletedTaskLineByText(
	docText: string,
	sectionHeading: string,
	lineText: string
): number | null {
	const lines = docText.split('\n');
	const range = findSectionRange(lines, sectionHeading);
	if (!range) return null;

	let found: number | null = null;
	for (let i = range.start + 1; i < range.end; i++) {
		if (lines[i] !== lineText) continue;
		if (TaskMarker.fromLine(lines[i])?.state !== TaskState.Completed) continue;
		if (found !== null) return null;
		found = i;
	}
	return found;
}

/**
 * Compute the change that deletes the line range [startLine, endLine) — the
 * source side of children that have been filed into a project note.
 *
 * @returns The change, or null when the range is empty
 */
export function computeLineRangeRemoval(
	docText: string,
	startLine: number,
	endLine: number
): { changes: Array<{ from: number; to: number; insert: string }> } | null {
	if (endLine <= startLine) return null;

	const lines = docText.split('\n');
	const docLength = docText.length;
	const from = lineToOffset(lines, startLine, docLength);
	const to = lineToOffset(lines, endLine, docLength);
	if (to <= from) return null;

	return { changes: [{ from, to, insert: '' }] };
}

/**
 * Find the line number of the first completed or started task in the Todo section.
 * Called fresh after each setTimeout to avoid stale line references.
 *
 * @param docText - Full document text
 * @param todoHeading - The Todo section heading (e.g., "## Todo")
 * @returns Line number (0-indexed), or null if none found
 */
export function findAutoMoveTriggerLine(
	docText: string,
	todoHeading: string
): number | null {
	const lines = docText.split('\n');
	const todoRange = findSectionRange(lines, todoHeading);
	if (!todoRange) return null;

	for (let i = todoRange.start + 1; i < todoRange.end; i++) {
		const marker = TaskMarker.fromLine(lines[i]);
		if (marker && (marker.state === TaskState.Completed || marker.state === TaskState.Started)) {
			return i;
		}
	}
	return null;
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
