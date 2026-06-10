import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { PeriodicNoteService } from '../utils/periodicNotes';
import { dedentLinesByAmount, insertMultipleUnderTargetHeading, TaskMarker } from '../utils/tasks';
import { countIndent } from '../utils/indent';
import { findProjectLinkInAncestors } from '../utils/projects';
import { ObsidianLinkResolver } from '../utils/wikilinks';
import {
	getActiveMarkdownFile,
	getOrCreateFile,
	getListItems,
	findSelectedTaskLines,
	getTransferableChildren,
	removeTransferredChildren
} from '../utils/commandSetup';
import { NOTICE_TIMEOUT_ERROR } from '../config';

/**
 * Migrate incomplete tasks from the current periodic note to the next note.
 *
 * Behavior:
 * 1. Check cursor/selection contains incomplete tasks
 * 2. Determine note type and target note (supports daily/weekly/monthly/yearly)
 * 3. Check target note exists
 * 4. Copy task(s) and their incomplete children to target under the configured
 *    task heading (completed/migrated subtrees stay in the source)
 * 5. Mark source task(s) as migrated [>] and remove transferred children
 *
 * Supports:
 * - All periodic note types (daily, weekly, monthly, yearly)
 * - Boundary transitions (Sunday → weekly, December → yearly)
 * - Multi-select (migrates all top-level incomplete tasks in selection)
 * - Single cursor (migrates task at cursor position)
 *
 * @param plugin - BulletFlow plugin instance
 */
export async function migrateTask(plugin: BulletFlowPlugin): Promise<void> {
	try {
		const context = getActiveMarkdownFile(plugin);
		if (!context) return;

		const { editor, file } = context;

		const noteService = new PeriodicNoteService(plugin.settings);
		const noteInfo = noteService.parseNoteType(file.basename);
		if (!noteInfo) {
			new Notice('Migrate task: This is not a periodic note.');
			return;
		}

		const targetPath = noteService.getNextNotePath(noteInfo) + '.md';

		const targetFile = await getOrCreateFile(plugin, targetPath);
		if (!targetFile) {
			new Notice(`Migrate task: Could not create target note: ${targetPath}`);
			return;
		}

		const listItems = getListItems(plugin, file);

		const taskLines = findSelectedTaskLines(editor, listItems, 'Migrate task');
		if (!taskLines) return;

		// Process tasks bottom-to-top so deferred source edits keep valid line numbers
		taskLines.sort((a, b) => b - a);

		// Phase 1: Collect content (read-only — the source is not touched until
		// the target write has succeeded, so a failure cannot lose content)
		const collectedContent: string[] = [];
		const sourceEdits: Array<{
			taskLine: number;
			migratedLine: string;
			children: ReturnType<typeof getTransferableChildren>;
		}> = [];

		const resolver = new ObsidianLinkResolver(plugin.app.metadataCache, plugin.app.vault);

		for (const taskLine of taskLines) {
			const lineText = editor.getLine(taskLine);
			const children = getTransferableChildren(editor, listItems, taskLine);

			// Build content to migrate (parent line + transferable children)
			const parentIndent = countIndent(lineText);
			const parentLineStripped = lineText.slice(parentIndent);
			// Convert started [/] to open [ ] in target
			const marker = TaskMarker.fromLine(parentLineStripped);
			let parentLineForTarget = marker ? marker.toOpen().applyToLine(parentLineStripped) : parentLineStripped;

			// A task nested under a project bullet loses that context in the
			// target (it arrives top-level) — restore it by prepending the
			// project link. Links already on the task line stay as they are.
			const projectLink = findProjectLinkInAncestors(
				editor, listItems, taskLine, file.path, resolver, plugin.settings
			);
			if (projectLink && projectLink.line !== taskLine) {
				parentLineForTarget = TaskMarker.prependToContent(
					parentLineForTarget, `[[${projectLink.link.basename}]]`
				);
			}

			let taskContent = parentLineForTarget;
			if (children && children.lines.length > 0) {
				const dedentedChildren = dedentLinesByAmount(children.lines, parentIndent);
				taskContent += '\n' + dedentedChildren.join('\n');
			}
			collectedContent.push(taskContent);

			const sourceMarker = TaskMarker.fromLine(lineText);
			const migratedLine = sourceMarker ? sourceMarker.toMigrated().applyToLine(lineText) : lineText;
			sourceEdits.push({ taskLine, migratedLine, children });
		}

		// Phase 2: Insert into target in original order
		// Content was collected bottom-to-top, reverse to restore original order
		collectedContent.reverse();

		const targetHeading = plugin.settings.periodicNoteTaskTargetHeading;
		await plugin.app.vault.process(targetFile, (data: string) => {
			return insertMultipleUnderTargetHeading(data, collectedContent, targetHeading);
		});

		// Phase 3: Mark source tasks as migrated and remove transferred children
		// (bottom-to-top; terminal subtrees stay)
		for (const edit of sourceEdits) {
			editor.setLine(edit.taskLine, edit.migratedLine);
			removeTransferredChildren(editor, edit.children);
		}

		const taskCount = taskLines.length;
		const message = taskCount === 1
			? 'Migrate task: Task migrated successfully.'
			: `Migrate task: ${taskCount} tasks migrated successfully.`;
		new Notice(message);
	} catch (e: any) {
		new Notice(`Migrate task error: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('migrateTask error:', e);
	}
}
