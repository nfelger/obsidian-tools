import { MarkdownView, Notice, TFile, Vault, Editor } from 'obsidian';
import type BulletFlowPlugin from '../main';
import type { ListItem, LinkResolver, BulletFlowSettings, ResolvedLink, ProjectTaskInsertItem } from '../types';
import { isIncompleteTask, findTopLevelTasksInRange, selectTransferableChildLines, TaskMarker, prepareTaskContentForTarget } from './tasks';
import { findChildrenBlockFromListItems, withoutTrailingEmptyLine } from './listItems';
import { countIndent } from './indent';
import { parseNoteType } from './periodicNotes';
import { createPeriodicNoteFromTemplate, getPeriodicConfig } from './periodicNoteCreator';
import { findProjectLinkInAncestors } from './projects';

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
 * A direct child group under a collector: the top-level line plus its own
 * nested descendants, in document order with original indentation.
 */
export interface CollectorChildGroup {
	/** Absolute line number of the group's top-level line */
	line: number;
	/** Whether the top-level line is itself a task */
	isTask: boolean;
	/** The group's lines, original indentation, in document order */
	lines: string[];
	/** Absolute [start, end) range in the source (end exclusive) */
	range: { start: number; end: number };
}

/**
 * Split a collector's transferable children into top-level groups — each
 * either a task (a decomposition candidate) or a non-task bullet (left in
 * the source). An already-terminal (completed/migrated) child subtree is
 * excluded entirely by `selectTransferableChildLines`, exactly as it is for
 * an ordinary task's children; it never appears in the returned groups.
 *
 * @param editor - The active editor
 * @param listItems - List items from metadata cache
 * @param collectorLine - Line number of the collector task
 * @returns Groups in document order, or [] when the collector has no children
 */
export function getCollectorChildGroups(
	editor: Editor,
	listItems: ListItem[],
	collectorLine: number
): CollectorChildGroup[] {
	const block = findChildrenBlockFromListItems(editor, listItems || [], collectorLine);
	if (!block) return [];

	const rawLines = withoutTrailingEmptyLine(block.lines);
	const flags = selectTransferableChildLines(rawLines);

	const groups: CollectorChildGroup[] = [];
	let baseIndent: number | null = null;
	let i = 0;
	while (i < rawLines.length) {
		if (!flags[i]) {
			i++;
			continue;
		}
		const line = rawLines[i];
		if (line.trim() === '') {
			i++;
			continue;
		}
		if (baseIndent === null) baseIndent = countIndent(line);

		const groupLines = [line];
		const groupStart = block.startLine + i;
		let j = i + 1;
		while (
			j < rawLines.length &&
			flags[j] &&
			(rawLines[j].trim() === '' || countIndent(rawLines[j]) > baseIndent)
		) {
			groupLines.push(rawLines[j]);
			j++;
		}

		groups.push({
			line: groupStart,
			isTask: !!TaskMarker.fromLine(line),
			lines: groupLines,
			range: { start: groupStart, end: groupStart + groupLines.length }
		});

		i = j;
	}

	return groups;
}

/**
 * Find the project link for a task (on its own line or an ancestor's) and
 * resolve it to the project's TFile, emitting the appropriate not-found
 * notice when either step fails.
 *
 * @param commandLabel - Notice prefix, e.g. "Drop task to project"
 * @returns The resolved link and project file, or null (notice already shown)
 */
export function resolveProjectLinkAndFile(
	editor: { getLine: (line: number) => string },
	listItems: ListItem[],
	taskLine: number,
	sourcePath: string,
	vault: Pick<Vault, 'getAbstractFileByPath'>,
	resolver: LinkResolver,
	settings: BulletFlowSettings,
	commandLabel: string
): { link: ResolvedLink; projectFile: TFile } | null {
	const projectLink = findProjectLinkInAncestors(editor, listItems, taskLine, sourcePath, resolver, settings);
	if (!projectLink) {
		new Notice(`${commandLabel}: No project link found for task on line ${taskLine + 1}.`);
		return null;
	}

	const projectFile = vault.getAbstractFileByPath(projectLink.link.path) as TFile;
	if (!projectFile) {
		new Notice(`${commandLabel}: Project note not found: ${projectLink.link.path}`);
		return null;
	}

	return { link: projectLink.link, projectFile };
}

/**
 * Decompose a selected collector line's task children into individual
 * project-task insert items, ready for `insertProjectTasksInSection`. Each
 * child is prepared the same way an ordinary selected task would be (see
 * `prepareTaskContentForTarget`); non-task children are excluded and stay in
 * the source under the now-scheduled/migrated collector line.
 *
 * @param options.reopenStarted - Convert `[/]` children to `[ ]` before
 *   rendering (see `prepareTaskContentForTarget`)
 * @returns The decomposed items and the collector-children removal ranges,
 *   in `TransferableChildren` shape for `removeTransferredChildren`
 */
export function decomposeCollectorForTransfer(
	editor: Editor,
	listItems: ListItem[],
	collectorLine: number,
	collectorCtx: { projectName: string; linkText: string },
	options: { reopenStarted: boolean }
): { projectName: string; items: ProjectTaskInsertItem[]; children: TransferableChildren } {
	const groups = getCollectorChildGroups(editor, listItems, collectorLine);
	const items: ProjectTaskInsertItem[] = [];
	const removalRanges: Array<{ start: number; end: number }> = [];

	for (const g of groups) {
		if (!g.isTask) continue;
		const prepared = prepareTaskContentForTarget(g.lines[0], g.lines.slice(1), options);
		items.push({
			taskText: prepared.taskText,
			taskContent: prepared.taskContent,
			childrenContent: prepared.childrenContent,
			linkText: collectorCtx.linkText
		});
		removalRanges.push(g.range);
	}
	removalRanges.reverse();

	return {
		projectName: collectorCtx.projectName,
		items,
		children: { lines: [], removalRanges }
	};
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
