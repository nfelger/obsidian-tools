import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { parseNoteType, getLowerNotePath, dateIsInPeriod } from '../utils/periodicNotes';
import {
	dedentLinesByAmount,
	extractTaskText,
	insertMultipleTasksWithDeduplication,
	markTaskAsScheduled
} from '../utils/tasks';
import type { TaskInsertItem } from '../utils/tasks';
import { findChildrenBlockFromListItems } from '../utils/listItems';
import { countIndent } from '../utils/indent';
import { getActiveMarkdownFile, getListItems, findSelectedTaskLines } from '../utils/commandSetup';
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

		const taskLines = findSelectedTaskLines(editor, listItems, 'pushTaskDown');
		if (!taskLines) return;

		// Process tasks from bottom to top to preserve line numbers during source edits
		taskLines.sort((a, b) => b - a);

		// Phase 1: Collect task data and modify source (bottom-to-top)
		const collectedTasks: TaskInsertItem[] = [];

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

			collectedTasks.push({ taskText, taskContent, childrenContent });

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

		// Phase 2: Insert into target in original order
		// Tasks were collected bottom-to-top, reverse to restore original order
		collectedTasks.reverse();

		let mergedCount = 0;
		let newCount = 0;
		const targetHeading = plugin.settings.periodicNoteTaskTargetHeading;
		await plugin.app.vault.process(targetFile, (data: string) => {
			const result = insertMultipleTasksWithDeduplication(data, collectedTasks, targetHeading);
			mergedCount = result.mergedCount;
			newCount = result.newCount;
			return result.content;
		});

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
