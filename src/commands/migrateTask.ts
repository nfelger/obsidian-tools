import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { parseNoteType, getNextNotePath } from '../utils/periodicNotes';
import { dedentLinesByAmount, insertMultipleUnderTargetHeading, TaskMarker } from '../utils/tasks';
import { findChildrenBlockFromListItems } from '../utils/listItems';
import { countIndent } from '../utils/indent';
import { getActiveMarkdownFile, getListItems, findSelectedTaskLines } from '../utils/commandSetup';
import { NOTICE_TIMEOUT_ERROR } from '../config';

/**
 * Migrate incomplete tasks from the current periodic note to the next note.
 *
 * Behavior:
 * 1. Check cursor/selection contains incomplete tasks
 * 2. Determine note type and target note (supports daily/weekly/monthly/yearly)
 * 3. Check target note exists
 * 4. Copy task(s) (and children) to target under "## Log"
 * 5. Mark source task(s) as migrated [>] and remove children
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

		const noteInfo = parseNoteType(file.basename, plugin.settings);
		if (!noteInfo) {
			new Notice('migrateTask: This is not a periodic note.');
			return;
		}

		const targetPath = getNextNotePath(noteInfo, plugin.settings) + '.md';

		const targetFile = plugin.app.vault.getAbstractFileByPath(targetPath) as TFile;
		if (!targetFile) {
			new Notice(`migrateTask: Target note does not exist: ${targetPath}`);
			return;
		}

		const listItems = getListItems(plugin, file);

		const taskLines = findSelectedTaskLines(editor, listItems, 'migrateTask');
		if (!taskLines) return;

		// Process tasks from bottom to top to preserve line numbers during source edits
		taskLines.sort((a, b) => b - a);

		// Phase 1: Collect content and modify source (bottom-to-top)
		const collectedContent: string[] = [];

		for (const taskLine of taskLines) {
			const lineText = editor.getLine(taskLine);
			const children = findChildrenBlockFromListItems(editor, listItems || [], taskLine);

			// Build content to migrate (parent line + children)
			const parentIndent = countIndent(lineText);
			const parentLineStripped = lineText.slice(parentIndent);
			// Convert started [/] to open [ ] in target
			const marker = TaskMarker.fromLine(parentLineStripped);
			const parentLineForTarget = marker ? marker.toOpen().applyToLine(parentLineStripped) : parentLineStripped;
			let taskContent = parentLineForTarget;
			if (children && children.lines.length > 0) {
				const dedentedChildren = dedentLinesByAmount(children.lines, parentIndent);
				taskContent += '\n' + dedentedChildren.join('\n');
			}
			collectedContent.push(taskContent);

			// Mark source line as migrated
			const sourceMarker = TaskMarker.fromLine(lineText);
			const migratedLine = sourceMarker ? sourceMarker.toMigrated().applyToLine(lineText) : lineText;
			editor.setLine(taskLine, migratedLine);

			// Remove children from source
			if (children && children.lines.length > 0) {
				editor.replaceRange(
					'',
					{ line: children.startLine, ch: 0 },
					{ line: children.endLine, ch: 0 }
				);
			}
		}

		// Phase 2: Insert into target in original order
		// Content was collected bottom-to-top, reverse to restore original order
		collectedContent.reverse();

		const targetHeading = plugin.settings.periodicNoteTaskTargetHeading;
		await plugin.app.vault.process(targetFile, (data: string) => {
			return insertMultipleUnderTargetHeading(data, collectedContent, targetHeading);
		});

		const taskCount = taskLines.length;
		const message = taskCount === 1
			? 'migrateTask: Task migrated successfully.'
			: `migrateTask: ${taskCount} tasks migrated successfully.`;
		new Notice(message);
	} catch (e: any) {
		new Notice(`migrateTask ERROR: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('migrateTask error:', e);
	}
}
