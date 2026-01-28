/**
 * Utilities for working with tasks in markdown.
 */

import { countIndent } from './indent';
import {
	INCOMPLETE_TASK_PATTERN,
	MIGRATE_TASK_PATTERN,
	SCHEDULED_MARKER,
	SCHEDULED_TASK_PATTERN,
	SCHEDULED_TO_OPEN_PATTERN,
	OPEN_TASK_MARKER
} from '../config';
import { DEFAULT_SETTINGS } from '../types';

// === Task State Machine ===

/**
 * Explicit task states following BuJo conventions.
 *
 * State transitions:
 * - Open/Started → Migrated (terminal) via migrateTask
 * - Open/Started → Scheduled via pushTaskDown/pullTaskUp
 * - Scheduled → Open via merge in target note
 * - Open/Started → Completed (terminal) via user action
 */
export enum TaskState {
	Open = ' ',
	Started = '/',
	Completed = 'x',
	Migrated = '>',
	Scheduled = '<',
}

/**
 * Task marker value object with state transition methods.
 */
export class TaskMarker {
	constructor(public readonly state: TaskState) {}

	/**
	 * Parse a task marker from a line of text.
	 * Returns null if the line is not a task.
	 */
	static fromLine(line: string): TaskMarker | null {
		const match = line.match(/^\s*- \[(.)\]/);
		if (!match) return null;

		const char = match[1];
		switch (char) {
			case ' ': return new TaskMarker(TaskState.Open);
			case '/': return new TaskMarker(TaskState.Started);
			case 'x':
			case 'X': return new TaskMarker(TaskState.Completed);
			case '>': return new TaskMarker(TaskState.Migrated);
			case '<': return new TaskMarker(TaskState.Scheduled);
			default: return null;
		}
	}

	/**
	 * Check if this task can be migrated (open or started).
	 */
	canMigrate(): boolean {
		return this.state === TaskState.Open || this.state === TaskState.Started;
	}

	/**
	 * Check if this task can be reopened (scheduled only).
	 */
	canReopen(): boolean {
		return this.state === TaskState.Scheduled;
	}

	/**
	 * Check if this task is incomplete (open or started).
	 */
	isIncomplete(): boolean {
		return this.state === TaskState.Open || this.state === TaskState.Started;
	}

	/**
	 * Check if this task is in a terminal state (completed or migrated).
	 */
	isTerminal(): boolean {
		return this.state === TaskState.Completed || this.state === TaskState.Migrated;
	}

	/**
	 * Create a migrated marker.
	 */
	toMigrated(): TaskMarker {
		return new TaskMarker(TaskState.Migrated);
	}

	/**
	 * Create a scheduled marker.
	 */
	toScheduled(): TaskMarker {
		return new TaskMarker(TaskState.Scheduled);
	}

	/**
	 * Create an open marker.
	 */
	toOpen(): TaskMarker {
		return new TaskMarker(TaskState.Open);
	}

	/**
	 * Render the marker as a string (e.g., "[ ]", "[>]").
	 */
	render(): string {
		return `[${this.state}]`;
	}

	/**
	 * Apply this marker to a task line, replacing the existing marker.
	 */
	applyToLine(line: string): string {
		return line.replace(/^(\s*- )\[.\]/, `$1${this.render()}`);
	}
}

// === Task Utilities ===

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

// === Deduplication and Task Transfer Helpers ===

/**
 * Check if a line is a scheduled task (marked with [<]).
 *
 * @param line - The line to check
 * @returns true if the line is a scheduled task
 */
export function isScheduledTask(line: string): boolean {
	return SCHEDULED_TASK_PATTERN.test(line);
}

/**
 * Mark a scheduled task as open by replacing [<] with [ ].
 *
 * @param line - The task line to mark
 * @returns The line with [ ] marker, or unchanged if not a scheduled task
 */
export function markScheduledAsOpen(line: string): string {
	if (!SCHEDULED_TASK_PATTERN.test(line)) {
		return line;
	}
	return line.replace(SCHEDULED_TO_OPEN_PATTERN, `$1${OPEN_TASK_MARKER}`);
}

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
 * Find a matching task in content by task text.
 * Searches for tasks that are either incomplete ([ ] or [/]) or scheduled ([<]).
 *
 * @param content - The file content to search
 * @param taskText - The task text to find (without checkbox)
 * @returns Object with line number and scheduled status, or null if not found
 */
export function findMatchingTask(
	content: string,
	taskText: string
): { lineNumber: number; isScheduled: boolean } | null {
	if (!taskText) return null;

	const lines = content.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineText = extractTaskText(line);

		if (lineText === taskText) {
			// Check if it's an incomplete or scheduled task (not completed)
			if (isIncompleteTask(line) || isScheduledTask(line)) {
				return {
					lineNumber: i,
					isScheduled: isScheduledTask(line)
				};
			}
		}
	}

	return null;
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

	const taskLine = lines[taskLineNumber];
	const taskIndent = countIndent(taskLine);

	// Find the end of the task's children block
	let insertLineNumber = taskLineNumber + 1;
	while (insertLineNumber < lines.length) {
		const currentLine = lines[insertLineNumber];
		// Empty lines are part of the block
		if (currentLine.trim() === '') {
			insertLineNumber++;
			continue;
		}
		// Check if this line is still a child (more indented than task)
		const currentIndent = countIndent(currentLine);
		if (currentIndent > taskIndent) {
			insertLineNumber++;
		} else {
			break;
		}
	}

	// Insert the children content
	const childrenLines = childrenContent.split('\n');
	lines.splice(insertLineNumber, 0, ...childrenLines);

	return lines.join('\n');
}

/**
 * Result of inserting a task with deduplication.
 */
export interface InsertTaskResult {
	content: string;
	wasMerged: boolean;
	reopenedScheduled: boolean;
}

/**
 * Insert a task into content with deduplication.
 *
 * If the task already exists (incomplete or scheduled), merges children under it.
 * If the existing task was scheduled [<], reopens it as [ ].
 * Otherwise, inserts as a new task under the target heading.
 *
 * @param content - The target file content
 * @param taskText - The task text (without checkbox) for deduplication matching
 * @param taskContent - The full task content to insert (parent + children, properly formatted)
 * @param childrenContent - Just the children content (for merging under existing task)
 * @param targetHeading - The heading to insert under if task is new
 * @returns Result with updated content and flags
 */
export function insertTaskWithDeduplication(
	content: string,
	taskText: string,
	taskContent: string,
	childrenContent: string,
	targetHeading: string
): InsertTaskResult {
	const match = findMatchingTask(content, taskText);

	if (match) {
		// Duplicate found - merge children under existing task
		let result = content;
		let reopenedScheduled = false;

		if (match.isScheduled) {
			// Reopen scheduled task
			const lines = result.split('\n');
			lines[match.lineNumber] = markScheduledAsOpen(lines[match.lineNumber]);
			result = lines.join('\n');
			reopenedScheduled = true;
		}

		if (childrenContent) {
			// Add proper indentation to children (2 spaces for child level)
			const indentedChildren = childrenContent.split('\n').map(line =>
				line ? '  ' + line : line
			).join('\n');
			result = insertChildrenUnderTask(result, match.lineNumber, indentedChildren);
		}

		return { content: result, wasMerged: true, reopenedScheduled };
	} else {
		// No duplicate - insert full task under heading
		const result = insertUnderTargetHeading(content, taskContent, targetHeading);
		return { content: result, wasMerged: false, reopenedScheduled: false };
	}
}
