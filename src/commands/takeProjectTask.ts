import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
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
import { isProjectNote, getProjectName, parseProjectKeywords, findCollectorTask, insertUnderCollectorTask } from '../utils/projects';
import { formatDailyPath } from '../utils/periodicNotes';
import {
	NOTICE_TIMEOUT_ERROR,
	STARTED_TO_OPEN_PATTERN,
	OPEN_TASK_MARKER
} from '../config';

/**
 * Take tasks from a project note and place them in today's daily note.
 *
 * Behavior:
 * 1. Verify current file is a project note (top-level in projects folder)
 * 2. Find today's daily note (error if it doesn't exist)
 * 3. Look for a collector task in the daily note (e.g., "- [ ] Push [[Project]]")
 * 4. If collector found: insert tasks as subtasks beneath it
 * 5. If no collector: insert under configured periodic note heading
 * 6. Prepend [[Project Name]] to each taken task
 * 7. Mark source task(s) as scheduled [<] and remove children
 *
 * @param plugin - BulletFlow plugin instance
 */
export async function takeProjectTask(plugin: BulletFlowPlugin): Promise<void> {
	try {
		const context = getActiveMarkdownFile(plugin);
		if (!context) return;

		const { editor, file } = context;

		// Verify this is a project note
		if (!isProjectNote(file.path, plugin.settings)) {
			new Notice('takeProjectTask: This is not a project note.');
			return;
		}

		const projectName = getProjectName(file.path, plugin.settings);
		if (!projectName) {
			new Notice('takeProjectTask: Cannot determine project name.');
			return;
		}

		// Find today's daily note
		const today = plugin.getToday ? plugin.getToday() : new Date();
		const dailyPath = formatDailyPath(today, plugin.settings) + '.md';
		const dailyFile = plugin.app.vault.getAbstractFileByPath(dailyPath) as TFile;
		if (!dailyFile) {
			new Notice(`takeProjectTask: Today's daily note does not exist: ${dailyPath}`);
			return;
		}

		const listItems = getListItems(plugin, file);

		// Find tasks to take (single cursor or multi-select)
		let taskLines: number[];
		if (editor.somethingSelected()) {
			const selections = editor.listSelections();
			const selection = selections[0];
			const startLine = Math.min(selection.anchor.line, selection.head.line);
			const endLine = Math.max(selection.anchor.line, selection.head.line);

			taskLines = findTopLevelTasksInRange(editor, listItems || [], startLine, endLine);

			if (taskLines.length === 0) {
				new Notice('takeProjectTask: No incomplete tasks in selection.');
				return;
			}
		} else {
			const currentLine = editor.getCursor().line;
			const lineText = editor.getLine(currentLine);

			if (!isIncompleteTask(lineText)) {
				new Notice('takeProjectTask: Cursor is not on an incomplete task.');
				return;
			}

			taskLines = [currentLine];
		}

		// Process tasks from bottom to top to preserve line numbers
		taskLines.sort((a, b) => b - a);

		// Parse collector keywords
		const keywords = parseProjectKeywords(plugin.settings.projectKeywords);

		// Track statistics
		let mergedCount = 0;
		let newCount = 0;

		for (const taskLine of taskLines) {
			const lineText = editor.getLine(taskLine);
			const children = findChildrenBlockFromListItems(editor, listItems || [], taskLine);

			// Extract task text for deduplication
			const taskText = extractTaskText(lineText);

			// Build content to take (parent line + children)
			const parentIndent = countIndent(lineText);
			const parentLineStripped = lineText.slice(parentIndent);
			// Convert started [/] to open [ ] in target
			const parentLineForTarget = parentLineStripped.replace(STARTED_TO_OPEN_PATTERN, '$1' + OPEN_TASK_MARKER);

			// Prepend [[Project Name]] to the task text
			const parentLineWithLink = parentLineForTarget.replace(
				/^(- \[.\]\s*)/,
				`$1[[${projectName}]] `
			);

			// Prepare children content (dedented)
			let childrenContent = '';
			if (children && children.lines.length > 0) {
				const dedentedChildren = dedentLinesByAmount(children.lines, parentIndent);
				childrenContent = dedentedChildren.join('\n');
			}

			// Build full task content for new insertions
			let taskContent = parentLineWithLink;
			if (childrenContent) {
				const indentedChildren = childrenContent.split('\n').map(line =>
					line ? '    ' + line : line
				).join('\n');
				taskContent += '\n' + indentedChildren;
			}

			// The task text for deduplication should include the project link
			const taskTextWithLink = `[[${projectName}]] ${taskText}`;

			// Process target (daily note)
			await plugin.app.vault.process(dailyFile, (data: string) => {
				// Check for collector task
				const collectorLine = findCollectorTask(data, projectName, keywords);

				if (collectorLine !== null) {
					// Insert as subtask under collector
					const result = insertUnderCollectorTask(data, collectorLine, taskContent);
					newCount++;
					return result;
				} else {
					// Insert under periodic note heading with deduplication
					const targetHeading = plugin.settings.periodicNoteTaskTargetHeading;
					const result = insertTaskWithDeduplication(
						data,
						taskTextWithLink,
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
				}
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
				? 'takeProjectTask: Task merged with existing in daily note.'
				: 'takeProjectTask: Task taken to daily note.';
		} else {
			const parts: string[] = [];
			if (newCount > 0) parts.push(`${newCount} new`);
			if (mergedCount > 0) parts.push(`${mergedCount} merged`);
			message = `takeProjectTask: ${taskCount} tasks taken to daily note (${parts.join(', ')}).`;
		}
		new Notice(message);
	} catch (e: any) {
		new Notice(`takeProjectTask ERROR: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.log('takeProjectTask ERROR', e);
	}
}
