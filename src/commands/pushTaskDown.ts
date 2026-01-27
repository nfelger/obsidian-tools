import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { parseNoteType, getLowerNotePath, dateIsInPeriod } from '../utils/periodicNotes';
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
import {
	NOTICE_TIMEOUT_ERROR,
	STARTED_TO_OPEN_PATTERN,
	OPEN_TASK_MARKER
} from '../config';

/**
 * Push incomplete tasks from the current periodic note to the lower-level note.
 *
 * Behavior:
 * 1. Check cursor/selection contains incomplete tasks
 * 2. Determine note type and target note (lower level for today)
 * 3. Check target note exists
 * 4. Copy task(s) (and children) to target under target heading
 * 5. Mark source task(s) as scheduled [<] and remove children
 *
 * Supports:
 * - Yearly → Monthly (current month)
 * - Monthly → Weekly (current week)
 * - Weekly → Daily (current day)
 * - Multi-select (pushes all top-level incomplete tasks in selection)
 * - Single cursor (pushes task at cursor position)
 *
 * @param plugin - BulletFlow plugin instance
 */
export async function pushTaskDown(plugin: BulletFlowPlugin): Promise<void> {
	try {
		const context = getActiveMarkdownFile(plugin);
		if (!context) return;

		const { editor, file } = context;

		const noteInfo = parseNoteType(file.basename, plugin.settings);
		if (!noteInfo) {
			new Notice('pushTaskDown: This is not a periodic note.');
			return;
		}

		// Check if already at daily level
		if (noteInfo.type === 'daily') {
			new Notice('pushTaskDown: Cannot push down from daily note (already at lowest level).');
			return;
		}

		// Get today's date (use plugin method for testability)
		const today = plugin.getToday ? plugin.getToday() : new Date();

		// Check if today is within the source period
		if (!dateIsInPeriod(today, noteInfo)) {
			new Notice('pushTaskDown: Current date is not in this period. Use Migrate Task to move forward.');
			return;
		}

		// Calculate target path (lower level note)
		let targetPath: string;
		try {
			const lowerPath = getLowerNotePath(noteInfo, today, plugin.settings);
			if (!lowerPath) {
				new Notice('pushTaskDown: Cannot determine target note.');
				return;
			}
			targetPath = lowerPath + '.md';
		} catch (e: any) {
			new Notice(`pushTaskDown: ${e.message}`);
			return;
		}

		const targetFile = plugin.app.vault.getAbstractFileByPath(targetPath) as TFile;
		if (!targetFile) {
			new Notice(`pushTaskDown: Target note does not exist: ${targetPath}`);
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
				new Notice('pushTaskDown: No incomplete tasks in selection.');
				return;
			}
		} else {
			// Single cursor: use current line
			const currentLine = editor.getCursor().line;
			const lineText = editor.getLine(currentLine);

			if (!isIncompleteTask(lineText)) {
				new Notice('pushTaskDown: Cursor is not on an incomplete task.');
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

			// Build content to push (parent line + children)
			const parentIndent = countIndent(lineText);
			const parentLineStripped = lineText.slice(parentIndent);
			// Convert started [/] to open [ ] in target
			const parentLineForTarget = parentLineStripped.replace(STARTED_TO_OPEN_PATTERN, '$1' + OPEN_TASK_MARKER);

			// Prepare children content (dedented)
			let childrenContent = '';
			if (children && children.lines.length > 0) {
				const dedentedChildren = dedentLinesByAmount(children.lines, parentIndent);
				childrenContent = dedentedChildren.join('\n');
			}

			// Build full task content for new insertions
			let taskContent = parentLineForTarget;
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
				? 'pushTaskDown: Task merged with existing in lower note.'
				: 'pushTaskDown: Task pushed to lower note.';
		} else {
			const parts: string[] = [];
			if (newCount > 0) parts.push(`${newCount} new`);
			if (mergedCount > 0) parts.push(`${mergedCount} merged`);
			message = `pushTaskDown: ${taskCount} tasks pushed to lower note (${parts.join(', ')}).`;
		}
		new Notice(message);
	} catch (e: any) {
		new Notice(`pushTaskDown ERROR: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.log('pushTaskDown ERROR', e);
	}
}
