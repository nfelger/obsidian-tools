/**
 * Utilities for working with tasks in markdown.
 */

import { countIndent, getLeadingWhitespace, detectIndentUnit, convertIndentUnit, indentLinesWith } from './indent';
import { DEFAULT_SETTINGS } from '../types';
import type { TaskInsertItem, ListItem } from '../types';
export { TaskState, TaskMarker, isIncompleteTask, markTaskAsScheduled, markScheduledAsOpen } from './taskMarker';
export type { TaskMatch } from './taskMarker';
import { TaskMarker, TaskState, isIncompleteTask, markScheduledAsOpen, type TaskMatch } from './taskMarker';

// === Task Utilities ===

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
 * "Top-level" means tasks that are not children of other tasks. A collector
 * line (e.g. "- [ ] Push [[Project]]") is not a real parent for this
 * purpose — its own task children are individually transferable project
 * tasks, not a subtree that travels with the collector, so `isCollectorLine`
 * lets callers exempt them from the ancestor-blocking check.
 *
 * @param editor - Editor object with getLine method
 * @param listItems - List items from metadataCache
 * @param startLine - Start of selection range (inclusive)
 * @param endLine - End of selection range (inclusive)
 * @param isCollectorLine - Optional predicate identifying a collector line
 * @returns Array of line numbers for top-level incomplete tasks
 */
export function findTopLevelTasksInRange(
	editor: { getLine: (line: number) => string },
	listItems: ListItem[],
	startLine: number,
	endLine: number,
	isCollectorLine?: (lineText: string) => boolean
): number[] {
	if (!listItems || listItems.length === 0) return [];

	// Build line-to-item map
	const lineToItem = new Map<number, ListItem>();
	for (const li of listItems) {
		if (li.position && li.position.start && typeof li.position.start.line === 'number') {
			lineToItem.set(li.position.start.line, li);
		}
	}

	// Find all incomplete tasks in the range
	const tasksInRange: Array<{ line: number; item: ListItem }> = [];
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
				if (!isCollectorLine || !isCollectorLine(parentText)) {
					isChild = true;
				}
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
 * Find the line range of a section defined by a heading.
 *
 * @param lines - All lines of the document
 * @param heading - The heading string (e.g., "## Log", "## Todo")
 * @returns Object with start (heading line) and end (exclusive: next same/higher-level heading or lines.length), or null if heading not found
 */
export function findSectionRange(
	lines: string[],
	heading: string
): { start: number; end: number } | null {
	const { level, text } = parseTargetHeading(heading);
	const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const headingRegex = new RegExp(`^${'#'.repeat(level)} ${escapedText}\\s*$`);

	let targetLineIdx = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].match(headingRegex)) {
			targetLineIdx = i;
			break;
		}
	}

	if (targetLineIdx < 0) return null;

	const headingPattern = /^(#{1,6})\s/;
	let endIdx = lines.length;
	for (let i = targetLineIdx + 1; i < lines.length; i++) {
		const match = lines[i].match(headingPattern);
		if (match && match[1].length <= level) {
			endIdx = i;
			break;
		}
	}

	return { start: targetLineIdx, end: endIdx };
}

/**
 * Find the innermost heading-delimited slice of a section containing a line.
 * Any heading line inside the section is a boundary. The returned bounds are
 * the boundary lines themselves (section start / heading / section end);
 * membership of a line l is: l > start && l < end.
 */
export function findSliceRange(
	lines: string[],
	section: { start: number; end: number },
	line: number
): { start: number; end: number } {
	const headingPattern = /^#{1,6}\s/;
	let start = section.start;
	for (let i = section.start + 1; i <= line && i < section.end; i++) {
		if (headingPattern.test(lines[i])) start = i;
	}
	let end = section.end;
	for (let i = line + 1; i < section.end; i++) {
		if (headingPattern.test(lines[i])) {
			end = i;
			break;
		}
	}
	return { start, end };
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
	targetHeading: string = DEFAULT_SETTINGS.periodicNoteTaskTargetHeading
): string {
	const lines = content.split('\n');
	const range = findSectionRange(lines, targetHeading);

	if (range) {
		// Skip trailing blank lines before the next section
		let insertIdx = range.end;
		while (insertIdx > range.start + 1 && lines[insertIdx - 1].trim() === '') {
			insertIdx--;
		}

		lines.splice(insertIdx, 0, taskContent);
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

/**
 * Insert a block directly after a heading (reverse-chronological placement),
 * creating the heading at the end of the file when it doesn't exist.
 *
 * The block is re-rendered in the target content's indentation unit. This is
 * the log-entry shape shared by extract log and complete project task —
 * contrast with insertUnderTargetHeading, which appends at the END of the
 * section and creates a missing heading after the frontmatter.
 *
 * @param content - The target file content (string or pre-split lines)
 * @param blockLines - The block to insert, including any surrounding blank lines
 * @param targetHeading - The heading to insert after (e.g., "## Log")
 * @returns Updated file content
 */
export function insertBlockAfterHeading(
	content: string | string[],
	blockLines: string[],
	targetHeading: string
): string {
	const lines = Array.isArray(content) ? content.slice() : content.split('\n');
	const targetUnit = detectIndentUnit(lines);
	const converted = targetUnit ? convertIndentUnit(blockLines, targetUnit) : blockLines;

	const range = findSectionRange(lines, targetHeading);
	if (range) {
		lines.splice(range.start + 1, 0, ...converted);
	} else {
		if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
			lines.push('');
		}
		lines.push(targetHeading, ...converted);
	}
	return lines.join('\n');
}

/**
 * Insert log entries under a sub-heading inside a target section, grouping
 * entries per sub-heading instead of repeating it.
 *
 * When the sub-heading already exists inside the target section, the entries
 * are appended at the end of its sub-section (before trailing blank lines),
 * so repeat invocations accumulate under one heading. Otherwise a new
 * sub-section block is started directly after the target heading
 * (reverse-chronological), and the target heading itself is created at the
 * end of the file when missing. Entries are re-rendered in the target's
 * indentation unit.
 *
 * @param content - The target file content (string or pre-split lines)
 * @param entryLines - The entry lines to insert (without the sub-heading)
 * @param targetHeading - The section heading (e.g., "## Log")
 * @param subHeading - The sub-heading to group under (e.g., "### [[2026-07-02 Thu]]")
 * @returns Updated file content
 */
export function insertUnderSubheading(
	content: string | string[],
	entryLines: string[],
	targetHeading: string,
	subHeading: string
): string {
	const lines = Array.isArray(content) ? content.slice() : content.split('\n');

	const section = findSectionRange(lines, targetHeading);
	if (section) {
		const sectionBody = lines.slice(section.start + 1, section.end);
		const sub = findSectionRange(sectionBody, subHeading);
		if (sub) {
			const targetUnit = detectIndentUnit(lines);
			const converted = targetUnit ? convertIndentUnit(entryLines, targetUnit) : entryLines;

			// Append at the end of the sub-section, before trailing blank lines
			const subHeadingIdx = section.start + 1 + sub.start;
			let insertIdx = section.start + 1 + sub.end;
			while (insertIdx > subHeadingIdx + 1 && lines[insertIdx - 1].trim() === '') {
				insertIdx--;
			}
			lines.splice(insertIdx, 0, ...converted);
			return lines.join('\n');
		}
	}

	return insertBlockAfterHeading(lines, ['', subHeading, ''].concat(entryLines), targetHeading);
}

// === Deduplication and Task Transfer Helpers ===

/**
 * Extract task text without checkbox and leading whitespace.
 * Used for deduplication comparison.
 *
 * Examples:
 * - "- [ ] Buy groceries" → "Buy groceries"
 * - "  - [<] Review PR" → "Review PR"
 * - "- [/] In progress task" → "In progress task"
 *
 * @param line - The task line
 * @returns The task text without checkbox, or empty string if not a task
 */
export function extractTaskText(line: string): string {
	// Match any task checkbox: [ ], [/], [<], [>], [x], etc.
	const match = line.match(/^\s*- \[.\]\s*(.*)$/);
	return match ? match[1].trim() : '';
}

/**
 * Find a live (open, started, or scheduled) task matching the given text,
 * reporting its actual TaskState.
 *
 * With `includeCompleted`, a completed match is also returned — but only as
 * a fallback when no live copy exists — so callers can distinguish "not
 * found" from "already completed". Migrated tasks are never matched —
 * they're terminal history, not something to merge into. Scoped to a
 * heading's section when one is given, otherwise searches the whole file.
 *
 * @param content - The file content to search (string or pre-split lines)
 * @param taskText - The task text to find (without checkbox)
 * @param options - heading: section to scope the search to (e.g., "## Todo");
 *   includeCompleted: also report a completed copy when no live one exists
 * @returns The match with file-absolute line number and state, or null
 */
export function findTaskMatch(
	content: string | string[],
	taskText: string,
	options: { heading?: string; includeCompleted?: boolean } = {}
): TaskMatch | null {
	if (!taskText) return null;

	const lines = Array.isArray(content) ? content : content.split('\n');
	let start = 0;
	let end = lines.length;
	if (options.heading !== undefined) {
		const range = findSectionRange(lines, options.heading);
		if (!range) return null;
		start = range.start + 1;
		end = range.end;
	}

	let completedMatch: TaskMatch | null = null;
	for (let i = start; i < end; i++) {
		if (extractTaskText(lines[i]) !== taskText) continue;
		const marker = TaskMarker.fromLine(lines[i]);
		if (!marker) continue;
		if (marker.isIncomplete() || marker.isScheduled()) {
			return { lineNumber: i, state: marker.state };
		}
		if (options.includeCompleted && marker.state === TaskState.Completed && !completedMatch) {
			completedMatch = { lineNumber: i, state: marker.state };
		}
	}
	return completedMatch;
}

/**
 * Find the exclusive end of a task's block: the task line plus all of its
 * more-indented children. Blank lines belong to the block only when a
 * more-indented line follows them — trailing blanks (e.g. the file's final
 * newline) are not part of it.
 *
 * @param lines - All lines of the document
 * @param taskLineNumber - The line number of the task
 * @returns The first line number after the task's block
 */
export function findTaskBlockEnd(lines: string[], taskLineNumber: number): number {
	const taskIndent = countIndent(lines[taskLineNumber]);
	let end = taskLineNumber + 1;
	let scan = taskLineNumber + 1;
	while (scan < lines.length) {
		const currentLine = lines[scan];
		if (currentLine.trim() === '') {
			scan++;
			continue;
		}
		if (countIndent(currentLine) > taskIndent) {
			scan++;
			end = scan;
		} else {
			break;
		}
	}
	return end;
}

/**
 * Insert children content under an existing task line.
 * Children are inserted after the task and any existing children.
 *
 * @param content - The file content
 * @param taskLineNumber - The line number of the parent task
 * @param childrenContent - The children content to insert (already properly indented)
 * @returns Updated file content
 */
export function insertChildrenUnderTask(
	content: string,
	taskLineNumber: number,
	childrenContent: string
): string {
	if (!childrenContent) return content;

	const lines = content.split('\n');
	if (taskLineNumber < 0 || taskLineNumber >= lines.length) return content;

	const insertLineNumber = findTaskBlockEnd(lines, taskLineNumber);

	// Insert the children content
	const childrenLines = childrenContent.split('\n');
	lines.splice(insertLineNumber, 0, ...childrenLines);

	return lines.join('\n');
}


/**
 * Build a task line with its children.
 *
 * Children must already carry their indentation relative to the task line
 * (i.e. dedented by the task's own indent). Their whitespace is preserved
 * verbatim — no unit is mixed in here; unit conversion happens at insertion
 * time against the target file.
 *
 * @param taskLine - The task line itself (e.g. "- [ ] Do something")
 * @param children - Child lines, indented relative to the task line
 */
export function buildTaskContent(taskLine: string, children: string[]): string {
	if (children.length === 0) return taskLine;
	return taskLine + '\n' + children.join('\n');
}

/**
 * Prepare a task line and its children for insertion into a target note:
 * strip the source's own indent, dedent the children to match, optionally
 * reopen a started `[/]` line to `[ ]` (transfer commands that land the task
 * in a note worked out of order reopen it; migrate does too, since a
 * migrated task is fresh work in the new period), and assemble the combined
 * content via `buildTaskContent`.
 *
 * @param lineText - The task line as it appears in the source, with its
 *   original leading indentation
 * @param childrenLines - Transferable children, original indentation,
 *   in document order
 * @param options.reopenStarted - Convert `[/]` to `[ ]` before rendering
 */
export function prepareTaskContentForTarget(
	lineText: string,
	childrenLines: string[],
	options: { reopenStarted: boolean }
): { taskText: string; taskContent: string; childrenContent: string; lineForTarget: string } {
	const parentIndent = countIndent(lineText);
	const strippedLine = lineText.slice(parentIndent);

	let lineForTarget = strippedLine;
	if (options.reopenStarted) {
		const marker = TaskMarker.fromLine(strippedLine);
		lineForTarget = marker ? marker.toOpen().applyToLine(strippedLine) : strippedLine;
	}

	const childrenContent = childrenLines.length > 0
		? dedentLinesByAmount(childrenLines, parentIndent).join('\n')
		: '';

	const taskContent = buildTaskContent(lineForTarget, childrenContent ? childrenContent.split('\n') : []);

	return { taskText: extractTaskText(lineText), taskContent, childrenContent, lineForTarget };
}

/**
 * Decide which lines of a children block travel with their task when it is
 * migrated/pushed/pulled, and which stay behind in the source.
 *
 * Subtrees rooted at a terminal task (completed [x] or migrated [>]) stay —
 * they are part of the source note's historical record. Everything else
 * (open/started tasks, notes, their descendants) moves. Blank lines follow
 * the subtree they appear in.
 *
 * @param lines - Children block lines with their original indentation
 * @returns One flag per line; true = line moves with the task
 */
export function selectTransferableChildLines(lines: string[]): boolean[] {
	const flags: boolean[] = [];
	let keptSubtreeIndent: number | null = null;

	for (const line of lines) {
		if (line.trim() === '') {
			flags.push(keptSubtreeIndent === null);
			continue;
		}

		const indent = countIndent(line);
		if (keptSubtreeIndent !== null && indent > keptSubtreeIndent) {
			flags.push(false);
			continue;
		}
		keptSubtreeIndent = null;

		const marker = TaskMarker.fromLine(line);
		if (marker && marker.isTerminal()) {
			keptSubtreeIndent = indent;
			flags.push(false);
		} else {
			flags.push(true);
		}
	}

	return flags;
}

// === Batch Insertion (order-preserving) ===

/**
 * Insert multiple tasks under a target heading as a single block.
 *
 * Tasks are joined and inserted in one operation, preserving their
 * relative order. The block appears directly after the heading.
 *
 * @param content - Full file content
 * @param taskContents - Task content strings in desired order
 * @param targetHeading - The target heading to insert under
 * @returns Updated file content
 */
export function insertMultipleUnderTargetHeading(
	content: string,
	taskContents: string[],
	targetHeading: string = DEFAULT_SETTINGS.periodicNoteTaskTargetHeading
): string {
	if (taskContents.length === 0) return content;
	const targetUnit = detectIndentUnit(content.split('\n'));
	const block = taskContents
		.map(tc => targetUnit ? convertIndentUnit(tc.split('\n'), targetUnit).join('\n') : tc)
		.join('\n');
	return insertUnderTargetHeading(content, block, targetHeading);
}

/**
 * Merge an incoming task into an existing matched copy: reopen a scheduled
 * match as open, and nest the incoming children under it (re-rendered in the
 * target's indent unit, prefixed with the matched task's own whitespace).
 */
export function mergeIntoMatchedTask(
	content: string,
	match: TaskMatch,
	childrenContent: string
): string {
	let result = content;
	if (match.state === TaskState.Scheduled) {
		const lines = result.split('\n');
		lines[match.lineNumber] = markScheduledAsOpen(lines[match.lineNumber]);
		result = lines.join('\n');
	}
	if (childrenContent) {
		const resultLines = result.split('\n');
		const childLines = childrenContent.split('\n');
		const targetUnit = detectIndentUnit(resultLines);
		const converted = targetUnit ? convertIndentUnit(childLines, targetUnit) : childLines;
		const matchedWs = getLeadingWhitespace(resultLines[match.lineNumber]);
		const indentedChildren = indentLinesWith(converted, matchedWs).join('\n');
		result = insertChildrenUnderTask(result, match.lineNumber, indentedChildren);
	}
	return result;
}

/**
 * Insert multiple tasks with deduplication, preserving original order.
 *
 * For each task (processed in the provided order):
 * - If a matching task exists: merge children under it (reopen if scheduled)
 * - If no match: collect for batch insertion
 *
 * New (non-merged) tasks are inserted as a single block under the target
 * heading, preserving their relative order.
 *
 * @param content - The target file content
 * @param tasks - Tasks in desired insertion order
 * @param targetHeading - The heading to insert under for new tasks
 * @returns Result with updated content and counts
 */
export function insertMultipleTasksWithDeduplication(
	content: string,
	tasks: TaskInsertItem[],
	targetHeading: string
): { content: string; mergedCount: number; newCount: number } {
	let result = content;
	let mergedCount = 0;
	const newTaskContents: string[] = [];

	for (const task of tasks) {
		const match = findTaskMatch(result, task.taskText);

		if (match) {
			result = mergeIntoMatchedTask(result, match, task.childrenContent);
			mergedCount++;
		} else {
			newTaskContents.push(task.taskContent);
		}
	}

	if (newTaskContents.length > 0) {
		result = insertMultipleUnderTargetHeading(result, newTaskContents, targetHeading);
	}

	return { content: result, mergedCount, newCount: newTaskContents.length };
}
