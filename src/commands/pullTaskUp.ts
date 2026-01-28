import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { parseNoteType, getHigherNotePath } from '../utils/periodicNotes';
import {
	isIncompleteTask,
	dedentLinesByAmount,
	findTopLevelTasksInRange,
	markTaskAsScheduled,
	extractTaskText,
	insertTaskWithDeduplication
} from '../utils/tasks';
import { findChildrenBlockFromListItems } from '../utils/listItems';
import { countIndent } from '../utils/indent';
import { getActiveMarkdownFile, getListItems } from '../utils/commandSetup';
import { NOTICE_TIMEOUT_ERROR } from '../config';

/**
 * Pull incomplete tasks from the current periodic note to the higher-level note.
 *
 * Behavior:
 * 1. Check cursor/selection contains incomplete tasks
 * 2. Determine note type and target note (higher level)
 * 3. Check target note exists
 * 4. For each task:
 *    - If task text already exists in target (incomplete or scheduled):
 *      - If scheduled, reopen it as [ ]
 *      - Merge children under existing task
 *    - If task doesn't exist in target:
 *      - Copy task (and children) to target under target heading
 * 5. Mark source task(s) as scheduled [<] and remove children
 *
 * Supports:
 * - Daily → Weekly
 * - Weekly → Monthly
 * - Monthly → Yearly
 * - Multi-select (pulls all top-level incomplete tasks in selection)
 * - Single cursor (pulls task at cursor position)
 * - Deduplication (merges children if task already exists in target)
 *
 * @param plugin - BulletFlow plugin instance
 */
export async function pullTaskUp(plugin: BulletFlowPlugin): Promise<void> {
	try {
		const context = getActiveMarkdownFile(plugin);
		if (!context) return;

		const { editor, file } = context;

		const noteInfo = parseNoteType(file.basename, plugin.settings);
		if (!noteInfo) {
			new Notice('pullTaskUp: This is not a periodic note.');
			return;
		}

		// Check if already at yearly level
		if (noteInfo.type === 'yearly') {
			new Notice('pullTaskUp: Cannot pull up from yearly note (already at highest level).');
			return;
		}

		// Calculate target path (higher level note)
		const higherPath = getHigherNotePath(noteInfo, plugin.settings);
		if (!higherPath) {
			new Notice('pullTaskUp: Cannot determine target note.');
			return;
		}

		const targetPath = higherPath + '.md';
		const targetFile = plugin.app.vault.getAbstractFileByPath(targetPath) as TFile;
		if (!targetFile) {
			new Notice(`pullTaskUp: Target note does not exist: ${targetPath}`);
			return;
		}

		const listItems = getListItems(plugin, file);

		// Check for selection vs single cursor
		let taskLines: number[];
		if (editor.somethingSelected()) {
			// Multi-select: find all top-level tasks in range
			const selections = editor.listSelections();
			const selection = selections[0];
			const startLine = Math.min(selection.anchor.line, selection.head.line);
			const endLine = Math.max(selection.anchor.line, selection.head.line);

			taskLines = findTopLevelTasksInRange(editor, listItems || [], startLine, endLine);

			if (taskLines.length === 0) {
				new Notice('pullTaskUp: No incomplete tasks in selection.');
				return;
			}
		} else {
			// Single cursor: use current line
			const currentLine = editor.getCursor().line;
			const lineText = editor.getLine(currentLine);

			if (!isIncompleteTask(lineText)) {
				new Notice('pullTaskUp: Cursor is not on an incomplete task.');
				return;
			}

			taskLines = [currentLine];
		}

		// Process tasks from bottom to top to preserve line numbers
		taskLines.sort((a, b) => b - a);

		// Track statistics
		let mergedCount = 0;
		let newCount = 0;

		for (const taskLine of taskLines) {
			const lineText = editor.getLine(taskLine);
			const children = findChildrenBlockFromListItems(editor, listItems || [], taskLine);

			// Extract task text for deduplication
			const taskText = extractTaskText(lineText);

			// Prepare children content (dedented)
			const parentIndent = countIndent(lineText);
			let childrenContent = '';
			if (children && children.lines.length > 0) {
				const dedentedChildren = dedentLinesByAmount(children.lines, parentIndent);
				childrenContent = dedentedChildren.join('\n');
			}

			// Build full task content for new insertions
			const parentLineStripped = lineText.slice(parentIndent);
			let taskContent = parentLineStripped;
			if (childrenContent) {
				const indentedChildren = childrenContent.split('\n').map(line =>
					line ? '  ' + line : line
				).join('\n');
				taskContent += '\n' + indentedChildren;
			}

			// Process target with deduplication
			const targetHeading = plugin.settings.targetSectionHeading;
			await plugin.app.vault.process(targetFile, (data: string) => {
				const result = insertTaskWithDeduplication(
					data,
					taskText,
					taskContent,
					childrenContent,
					targetHeading
				);
				if (result.wasMerged) {
					mergedCount++;
				} else {
					newCount++;
				}
				return result.content;
			});

			// Mark source line as scheduled
			const scheduledLine = markTaskAsScheduled(lineText);
			editor.setLine(taskLine, scheduledLine);

			// Remove children from source
			if (children && children.lines.length > 0) {
				editor.replaceRange(
					'',
					{ line: children.startLine, ch: 0 },
					{ line: children.endLine, ch: 0 }
				);
			}
		}

		const taskCount = taskLines.length;
		let message: string;
		if (taskCount === 1) {
			message = mergedCount > 0
				? 'pullTaskUp: Task merged with existing in higher note.'
				: 'pullTaskUp: Task pulled to higher note.';
		} else {
			const parts: string[] = [];
			if (newCount > 0) parts.push(`${newCount} new`);
			if (mergedCount > 0) parts.push(`${mergedCount} merged`);
			message = `pullTaskUp: ${taskCount} tasks pulled to higher note (${parts.join(', ')}).`;
		}
		new Notice(message);
	} catch (e: any) {
		new Notice(`pullTaskUp ERROR: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.log('pullTaskUp ERROR', e);
	}
}
