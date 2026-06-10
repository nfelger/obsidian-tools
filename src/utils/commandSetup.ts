import { MarkdownView, Notice, TFile, Editor } from 'obsidian';
import type BulletFlowPlugin from '../main';
import type { ListItem } from '../types';
import { isIncompleteTask, findTopLevelTasksInRange, selectTransferableChildLines } from './tasks';
import { findChildrenBlockFromListItems } from './listItems';

/**
 * Context for working with an active markdown file.
 */
export interface ActiveMarkdownContext {
	view: MarkdownView;
	editor: Editor;
	file: TFile;
}

/**
 * Get the currently active markdown file and editor.
 *
 * @param plugin - Plugin instance
 * @returns Context object or null if no active markdown view/file
 */
export function getActiveMarkdownFile(
	plugin: BulletFlowPlugin
): ActiveMarkdownContext | null {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) {
		new Notice('No active markdown view.');
		return null;
	}

	const file = view.file;
	if (!file) {
		new Notice('No active file.');
		return null;
	}

	return {
		view,
		editor: view.editor,
		file
	};
}

/**
 * Get list items metadata from file cache.
 *
 * @param plugin - Plugin instance
 * @param file - File to get metadata for
 * @returns Array of list items, or empty array if none found
 */
export function getListItems(plugin: BulletFlowPlugin, file: TFile): ListItem[] {
	const cache = plugin.app.metadataCache.getFileCache(file);
	return (cache?.listItems as ListItem[]) || [];
}

/**
 * The children of a task that travel with it during a transfer.
 */
export interface TransferableChildren {
	/** Moved lines with their original indentation, in document order */
	lines: string[];
	/** Source ranges to delete (end exclusive), ordered bottom-to-top */
	removalRanges: Array<{ start: number; end: number }>;
}

/**
 * Collect the children of a task that should move with it, leaving
 * terminal-state subtrees (completed/migrated) behind in the source.
 *
 * @param editor - The active editor
 * @param listItems - List items from metadata cache
 * @param taskLine - Line number of the task
 * @returns Transferable children, or null if the task has no children
 */
export function getTransferableChildren(
	editor: Editor,
	listItems: ListItem[],
	taskLine: number
): TransferableChildren | null {
	const block = findChildrenBlockFromListItems(editor, listItems || [], taskLine);
	if (!block) return null;

	// getRange ends at column 0 of the exclusive end line, so the split
	// always yields a trailing empty string that is not a real block line
	let rawLines = block.lines;
	if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
		rawLines = rawLines.slice(0, -1);
	}

	const flags = selectTransferableChildLines(rawLines);
	const lines = rawLines.filter((_, i) => flags[i]);

	const removalRanges: Array<{ start: number; end: number }> = [];
	let i = 0;
	while (i < flags.length) {
		if (flags[i]) {
			let j = i;
			while (j < flags.length && flags[j]) j++;
			removalRanges.push({ start: block.startLine + i, end: block.startLine + j });
			i = j;
		} else {
			i++;
		}
	}
	removalRanges.reverse();

	return { lines, removalRanges };
}

/**
 * Delete the source ranges of transferred children, bottom-to-top.
 */
export function removeTransferredChildren(editor: Editor, children: TransferableChildren | null): void {
	if (!children) return;
	for (const range of children.removalRanges) {
		editor.replaceRange(
			'',
			{ line: range.start, ch: 0 },
			{ line: range.end, ch: 0 }
		);
	}
}

/**
 * Find task lines from the current selection or cursor position.
 *
 * Returns an array of line numbers for incomplete tasks, or null if none
 * found (with an appropriate Notice shown to the user).
 *
 * @param editor - The active editor
 * @param listItems - List items from metadata cache
 * @param commandName - Command name for user-facing notices
 * @returns Array of task line numbers, or null if no tasks found
 */
export function findSelectedTaskLines(
	editor: Editor,
	listItems: ListItem[],
	commandName: string
): number[] | null {
	if (editor.somethingSelected()) {
		const selections = editor.listSelections();
		const selection = selections[0];
		const startLine = Math.min(selection.anchor.line, selection.head.line);
		const endLine = Math.max(selection.anchor.line, selection.head.line);

		const taskLines = findTopLevelTasksInRange(editor, listItems || [], startLine, endLine);

		if (taskLines.length === 0) {
			new Notice(`${commandName}: No incomplete tasks in selection.`);
			return null;
		}
		return taskLines;
	} else {
		const currentLine = editor.getCursor().line;
		const lineText = editor.getLine(currentLine);

		if (!isIncompleteTask(lineText)) {
			new Notice(`${commandName}: Cursor is not on an incomplete task.`);
			return null;
		}

		return [currentLine];
	}
}
