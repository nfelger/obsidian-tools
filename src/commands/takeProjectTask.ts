import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import {
	dedentLinesByAmount,
	extractTaskText,
	insertMultipleTasksWithDeduplication,
	markTaskAsScheduled
} from '../utils/tasks';
import type { TaskInsertItem } from '../utils/tasks';
import { findChildrenBlockFromListItems } from '../utils/listItems';
import { countIndent, indentLines } from '../utils/indent';
import { getActiveMarkdownFile, getListItems, findSelectedTaskLines } from '../utils/commandSetup';
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

		const taskLines = findSelectedTaskLines(editor, listItems, 'takeProjectTask');
		if (!taskLines) return;

		// Process tasks from bottom to top to preserve line numbers during source edits
		taskLines.sort((a, b) => b - a);

		// Parse collector keywords
		const keywords = parseProjectKeywords(plugin.settings.projectKeywords);

		// Phase 1: Collect task data and modify source (bottom-to-top)
		const collectedTasks: Array<TaskInsertItem & { taskContentForCollector: string }> = [];

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

			// Build full task content for collector insertion (4-space children, no project link)
			// The collector task already identifies the project, so prepending [[Project]] is redundant noise
			let taskContentForCollector = parentLineForTarget;
			if (childrenContent) {
				const indentedChildren = indentLines(childrenContent.split('\n'), 4).join('\n');
				taskContentForCollector += '\n' + indentedChildren;
			}

			// Build full task content for heading insertion (4-space children)
			let taskContent = parentLineWithLink;
			if (childrenContent) {
				const indentedChildren = indentLines(childrenContent.split('\n'), 4).join('\n');
				taskContent += '\n' + indentedChildren;
			}

			// The task text for deduplication should include the project link
			const taskTextWithLink = `[[${projectName}]] ${taskText}`;

			collectedTasks.push({
				taskText: taskTextWithLink,
				taskContent,
				childrenContent,
				taskContentForCollector
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

		// Phase 2: Insert into target in original order
		// Tasks were collected bottom-to-top, reverse to restore original order
		collectedTasks.reverse();

		let mergedCount = 0;
		let newCount = 0;

		await plugin.app.vault.process(dailyFile, (data: string) => {
			// Check for collector task
			const collectorLine = findCollectorTask(data, projectName, keywords);

			if (collectorLine !== null) {
				// Batch insert under collector as a single block (preserves order)
				const block = collectedTasks.map(t => t.taskContentForCollector).join('\n');
				newCount = collectedTasks.length;
				return insertUnderCollectorTask(data, collectorLine, block);
			} else {
				// Batch insert with deduplication under heading (preserves order)
				const targetHeading = plugin.settings.periodicNoteTaskTargetHeading;
				const result = insertMultipleTasksWithDeduplication(
					data,
					collectedTasks,
					targetHeading
				);
				mergedCount = result.mergedCount;
				newCount = result.newCount;
				return result.content;
			}
		});

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
		console.error('takeProjectTask error:', e);
	}
}
