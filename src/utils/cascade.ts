/**
 * Pure helpers for cascading a completed task down the periodic-note chain.
 *
 * When a task is ticked in a weekly, monthly or yearly note, it travels one
 * level down at a time until it reaches today's daily note, where it lands
 * completed under the daily log heading. Every note it passes through keeps
 * it as `[<]` — the scheduled marker is the paper trail.
 *
 * All functions operate on plain strings — no Obsidian or CM6 dependencies.
 */

import { countIndent } from './indent';
import {
	buildTaskContent,
	dedentLinesByAmount,
	extractTaskText,
	findTaskBlockEnd,
	findSectionRange,
	insertTaskWithDedup,
	selectTransferableChildLines,
	TaskMarker,
	TaskState
} from './tasks';
import { findLogInsertionLine } from './autoMove';

/** A task travelling down the chain, with the children that travel with it. */
export interface CascadePayload {
	/** Task text without the checkbox — the identity used for merging */
	taskText: string;
	/** The task line, without the indentation it had in its source note */
	taskLine: string;
	/** The children that travel with it, relative to the task line's indent */
	children: string[];
}

/**
 * Collect the task at a line and the children that travel with it.
 *
 * Children follow push-down rules: a subtree rooted at a terminal task
 * (completed or migrated) stays behind, everything else moves.
 *
 * @param docText - Full text of the note the task was ticked in
 * @param taskLine - Line number of the ticked task
 */
export function extractCascadePayload(docText: string, taskLine: number): CascadePayload | null {
	const lines = docText.split('\n');
	if (taskLine < 0 || taskLine >= lines.length) return null;

	const line = lines[taskLine];
	const marker = TaskMarker.fromLine(line);
	if (!marker || marker.state !== TaskState.Completed) return null;

	const block = taskBlock(lines, taskLine);

	return {
		taskText: extractTaskText(line),
		taskLine: line.slice(block.indent),
		children: dedentLinesByAmount(block.moving, block.indent)
	};
}

/**
 * Put the task into a note it passes through on its way down: under the
 * note's task heading, marked `[<]`.
 *
 * A note that already holds the task merges with it the way push down does —
 * the incoming children are nested under the existing copy — and the merged
 * task keeps travelling, carrying the children it now holds.
 *
 * @param content - The note's content
 * @param payload - The task travelling down
 * @param heading - The note's task heading (e.g. "## Todo")
 * @returns The updated content and the payload for the next hop
 */
export function scheduleIntoNote(
	content: string,
	payload: CascadePayload,
	heading: string
): { content: string; payload: CascadePayload } {
	const scheduled = new TaskMarker(TaskState.Scheduled).applyToLine(payload.taskLine);

	// The same insert push down uses: a note that already holds the task
	// merges with it (the incoming children nest under the existing copy).
	const result = insertTaskWithDedup(
		content,
		{
			taskText: payload.taskText,
			taskContent: buildTaskContent(scheduled, payload.children),
			childrenContent: payload.children.join('\n')
		},
		heading
	);

	const lines = result.content.split('\n');
	if (result.lineNumber < 0 || result.lineNumber >= lines.length) {
		return { content: result.content, payload: { ...payload, taskLine: scheduled } };
	}

	// The note keeps the task as scheduled, and it keeps travelling with the
	// children it now holds — the ones it came with plus any it merged.
	const landed = new TaskMarker(TaskState.Scheduled).applyToLine(lines[result.lineNumber]);
	lines[result.lineNumber] = landed;

	const blockEnd = findTaskBlockEnd(lines, result.lineNumber);
	const indent = countIndent(landed);
	const children = dedentLinesByAmount(lines.slice(result.lineNumber + 1, blockEnd), indent);

	return {
		content: lines.join('\n'),
		payload: { taskText: extractTaskText(landed), taskLine: landed, children }
	};
}

/**
 * Put the completed task into a daily note's log, creating the log heading
 * when the note doesn't have one yet.
 *
 * @param content - The daily note's content
 * @param payload - The task arriving from the note above
 * @param logHeading - The daily note's log heading (e.g. "## Log")
 * @param options.withChildren - When false, only the task line is filed
 *   (a project task's children live in the project note)
 */
export function insertCompletedIntoLog(
	content: string,
	payload: CascadePayload,
	logHeading: string,
	options: { withChildren?: boolean } = {}
): string {
	const completed = new TaskMarker(TaskState.Completed).applyToLine(payload.taskLine);
	const block = options.withChildren === false
		? completed
		: buildTaskContent(completed, payload.children);

	const lines = content.split('\n');
	const range = findSectionRange(lines, logHeading);

	if (range) {
		const insertLine = findLogInsertionLine(lines, range.start, range.end);
		lines.splice(insertLine, 0, ...block.split('\n'));
		return lines.join('\n');
	}

	const out = lines.slice();
	if (out.length > 0 && out[out.length - 1].trim() !== '') out.push('');
	out.push(logHeading, ...block.split('\n'));
	return out.join('\n');
}

/** A change that rewrites a range of the source note. */
export interface CascadeSourceChange {
	from: number;
	to: number;
	insert: string;
}

/**
 * Compute the change that turns the ticked task into its scheduled form in
 * the note it was ticked in: the line becomes `[<]` and the children that
 * travelled down are removed, while terminal subtrees stay behind.
 *
 * @param docText - Full text of the source note
 * @param taskLine - Line number of the ticked task
 */
export function computeSourceSchedule(docText: string, taskLine: number): CascadeSourceChange | null {
	const lines = docText.split('\n');
	if (taskLine < 0 || taskLine >= lines.length) return null;

	const line = lines[taskLine];
	const marker = TaskMarker.fromLine(line);
	if (!marker || marker.state !== TaskState.Completed) return null;

	const block = taskBlock(lines, taskLine);
	const kept = block.childLines.filter((_, i) => !block.flags[i]);

	const scheduled = new TaskMarker(TaskState.Scheduled).applyToLine(line);
	const replacement = [scheduled, ...kept].join('\n');

	const from = lineToOffset(lines, taskLine);
	const to = lineToOffset(lines, taskLine + 1 + block.childLines.length);
	const insert = to < docText.length ? replacement + '\n' : replacement;

	return { from, to, insert };
}

/**
 * The block of a task: its indentation, its children, and the children that
 * travel with it (a subtree rooted at a terminal task stays behind).
 */
function taskBlock(
	lines: string[],
	taskLine: number
): { indent: number; childLines: string[]; flags: boolean[]; moving: string[] } {
	const indent = countIndent(lines[taskLine]);
	const blockEnd = findTaskBlockEnd(lines, taskLine);
	const childLines = lines.slice(taskLine + 1, blockEnd);
	const flags = selectTransferableChildLines(childLines);
	return { indent, childLines, flags, moving: childLines.filter((_, i) => flags[i]) };
}

/**
 * Convert a line number to a character offset in the document.
 */
function lineToOffset(lines: string[], lineNum: number): number {
	if (lineNum >= lines.length) return lines.join('\n').length;
	const before = lines.slice(0, lineNum).join('\n');
	return before.length + (lineNum > 0 ? 1 : 0);
}
