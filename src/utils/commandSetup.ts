import { MarkdownView, Notice, TFile, Editor } from 'obsidian';
import type BulletFlowPlugin from '../main';
import type { ListItem } from '../types';

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
