import { MarkdownView, Notice, TFile, Editor } from 'obsidian';
import type BulletFlowPlugin from '../main';
import type { ListItem } from '../types';
import { isIncompleteTask, findTopLevelTasksInRange } from './tasks';

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
