import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { parseNoteType, getNextNotePath } from '../utils/periodicNotes';
import { isIncompleteTask, dedentLinesByAmount, insertUnderLogHeading, findTopLevelTasksInRange } from '../utils/tasks';
import { findChildrenBlockFromListItems } from '../utils/listItems';
import { countIndent } from '../utils/indent';
import { getActiveMarkdownFile, getListItems } from '../utils/commandSetup';

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

		const noteInfo = parseNoteType(file.basename);
		if (!noteInfo) {
			new Notice('migrateTask: This is not a periodic note.');
			return;
		}

		const targetPath = getNextNotePath(noteInfo) + '.md';

		const targetFile = plugin.app.vault.getAbstractFileByPath(targetPath) as TFile;
		if (!targetFile) {
			new Notice(`migrateTask: Target note does not exist: ${targetPath}`);
			return;
		}

		const listItems = getListItems(plugin, file);

		// Check for selection vs single cursor
		// Use somethingSelected() for more reliable detection on mobile
		let taskLines: number[];
		if (editor.somethingSelected()) {
			// Multi-select: find all top-level tasks in range
			const selections = editor.listSelections();
			const selection = selections[0];
			const startLine = Math.min(selection.anchor.line, selection.head.line);
			const endLine = Math.max(selection.anchor.line, selection.head.line);

			taskLines = findTopLevelTasksInRange(editor, listItems || [], startLine, endLine);

			if (taskLines.length === 0) {
				new Notice('migrateTask: No incomplete tasks in selection.');
				return;
			}
		} else {
			// Single cursor: use current line
			const currentLine = editor.getCursor().line;
			const lineText = editor.getLine(currentLine);

			if (!isIncompleteTask(lineText)) {
				new Notice('migrateTask: Cursor is not on an incomplete task.');
				return;
			}

			taskLines = [currentLine];
		}

		// Process tasks from bottom to top to preserve line numbers
		taskLines.sort((a, b) => b - a);

		// Collect all content to migrate
		const allContentToMigrate: string[] = [];

		for (const taskLine of taskLines) {
			const lineText = editor.getLine(taskLine);
			const children = findChildrenBlockFromListItems(editor, listItems || [], taskLine);

			// Build content to migrate (parent line + children)
			const parentIndent = countIndent(lineText);
			const parentLineStripped = lineText.slice(parentIndent);
			// Convert started [/] to open [ ] in target
			const parentLineForTarget = parentLineStripped.replace(/^(- )\[\/\]/, '$1[ ]');
			let taskContent = parentLineForTarget;
			if (children && children.lines.length > 0) {
				const dedentedChildren = dedentLinesByAmount(children.lines, parentIndent);
				taskContent += '\n' + dedentedChildren.join('\n');
			}
			allContentToMigrate.push(taskContent);

			// Mark source line as migrated
			const migratedLine = lineText.replace(/^(\s*- )\[[ /]\]/, '$1[>]');
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

		// Reverse to restore original order (we processed bottom-to-top)
		allContentToMigrate.reverse();

		// Add all content to target note under ## Log
		await plugin.app.vault.process(targetFile, (data: string) => {
			let result = data;
			for (const content of allContentToMigrate) {
				result = insertUnderLogHeading(result, content);
			}
			return result;
		});

		const taskCount = taskLines.length;
		const message = taskCount === 1
			? 'migrateTask: Task migrated successfully.'
			: `migrateTask: ${taskCount} tasks migrated successfully.`;
		new Notice(message);
	} catch (e: any) {
		new Notice(`migrateTask ERROR: ${e.message}`, 8000);
		console.log('migrateTask ERROR', e);
	}
}
