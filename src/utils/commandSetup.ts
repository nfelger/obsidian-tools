import { MarkdownView, Notice, TFile, Editor } from 'obsidian';
import type BulletFlowPlugin from '../main';
import type { ListItem } from '../types';
import { isIncompleteTask, findTopLevelTasksInRange, selectTransferableChildLines } from './tasks';
import { findChildrenBlockFromListItems, withoutTrailingEmptyLine } from './listItems';
import { parseNoteType } from './periodicNotes';
import { createPeriodicNoteFromTemplate, getPeriodicConfig } from './periodicNoteCreator';

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
 * Get a file by path, creating it (and its parent folders) when missing.
 *
 * Used for transfer targets: periodic notes for a future day/week often
 * don't exist yet, and erroring out forces the user to create them by hand.
 * Created notes start empty — the insertion logic adds the target heading.
 *
 * @param plugin - Plugin instance
 * @param path - Full vault path including extension
 * @returns The existing or newly created file, or null if creation failed
 */
export async function getOrCreateFile(plugin: BulletFlowPlugin, path: string): Promise<TFile | null> {
	const existing = plugin.app.vault.getAbstractFileByPath(path) as TFile;
	if (existing) return existing;

	// Periodic notes: prefer the Daily Notes / Periodic Notes creation
	// machinery so the user's configured template is applied
	const basename = path.split('/').pop()!.replace(/\.md$/, '');
	const noteInfo = parseNoteType(basename, getPeriodicConfig());
	if (noteInfo) {
		const created = await createPeriodicNoteFromTemplate(noteInfo);
		if (created) {
			const atExpectedPath = plugin.app.vault.getAbstractFileByPath(path) as TFile;
			if (atExpectedPath) return atExpectedPath;
			console.warn(
				`Bullet Flow: periodic note created at "${created.path}" but expected "${path}" — ` +
				'check that the filename patterns match the Periodic Notes settings.'
			);
			return created;
		}
	}

	try {
		// Ensure parent folders exist, innermost last
		const parts = path.split('/').slice(0, -1);
		let dir = '';
		for (const part of parts) {
			dir = dir ? `${dir}/${part}` : part;
			if (!plugin.app.vault.getAbstractFileByPath(dir)) {
				await plugin.app.vault.createFolder(dir);
			}
		}
		return await plugin.app.vault.create(path, '');
	} catch (e) {
		console.error('getOrCreateFile error:', e);
		return null;
	}
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

	const rawLines = withoutTrailingEmptyLine(block.lines);

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
		const taskLineSet = new Set<number>();
		for (const selection of editor.listSelections()) {
			const startLine = Math.min(selection.anchor.line, selection.head.line);
			const endLine = Math.max(selection.anchor.line, selection.head.line);
			for (const line of findTopLevelTasksInRange(editor, listItems || [], startLine, endLine)) {
				taskLineSet.add(line);
			}
		}

		if (taskLineSet.size === 0) {
			new Notice(`${commandName}: No incomplete tasks in selection.`);
			return null;
		}
		return [...taskLineSet].sort((a, b) => a - b);
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
