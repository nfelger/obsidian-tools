import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { PeriodicNoteService } from '../utils/periodicNotes';
import {
	buildTaskContent,
	dedentLinesByAmount,
	extractTaskText,
	insertMultipleTasksWithDeduplication,
	markTaskAsScheduled,
	TaskMarker
} from '../utils/tasks';
import type { TaskInsertItem } from '../types';
import { countIndent } from '../utils/indent';
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

		const noteService = new PeriodicNoteService(plugin.settings);
		const noteInfo = noteService.parseNoteType(file.basename);
		if (!noteInfo) {
			new Notice('Push task down: This is not a periodic note.');
			return;
		}

		// Check if already at daily level
		if (noteInfo.type === 'daily') {
			new Notice('Push task down: Cannot push down from daily note (already at lowest level).');
			return;
		}

		// Get today's date (use plugin method for testability)
		const today = plugin.getToday ? plugin.getToday() : new Date();

		// Check if today is within the source period
		if (!noteService.dateIsInPeriod(today, noteInfo)) {
			new Notice('Push task down: Current date is not in this period. Use Migrate Task to move forward.');
			return;
		}

		// Calculate target path (lower level note)
		let targetPath: string;
		try {
			const lowerPath = noteService.getLowerNotePath(noteInfo, today);
			if (!lowerPath) {
				new Notice('Push task down: Cannot determine target note.');
				return;
			}
			targetPath = lowerPath + '.md';
		} catch (e: any) {
			new Notice(`Push task down: ${e.message}`);
			return;
		}

		const targetFile = await getOrCreateFile(plugin, targetPath);
		if (!targetFile) {
			new Notice(`Push task down: Could not create target note: ${targetPath}`);
			return;
		}

		const listItems = getListItems(plugin, file);

		const taskLines = findSelectedTaskLines(editor, listItems, 'Push task down');
		if (!taskLines) return;

		// Process tasks bottom-to-top so deferred source edits keep valid line numbers
		taskLines.sort((a, b) => b - a);

		// Phase 1: Collect task data (read-only — source edits are deferred
		// until the target write has succeeded)
		const collectedTasks: TaskInsertItem[] = [];
		const sourceEdits: Array<{
			taskLine: number;
			scheduledLine: string;
			children: ReturnType<typeof getTransferableChildren>;
		}> = [];

		for (const taskLine of taskLines) {
			const lineText = editor.getLine(taskLine);
			const children = getTransferableChildren(editor, listItems, taskLine);

			// Extract task text for deduplication
			const taskText = extractTaskText(lineText);

			// Build content to push (parent line + children)
			const parentIndent = countIndent(lineText);
			const parentLineStripped = lineText.slice(parentIndent);
			// Convert started [/] to open [ ] in target
			const marker = TaskMarker.fromLine(parentLineStripped);
			const parentLineForTarget = marker ? marker.toOpen().applyToLine(parentLineStripped) : parentLineStripped;

			// Prepare children content (dedented)
			let childrenContent = '';
			if (children && children.lines.length > 0) {
				const dedentedChildren = dedentLinesByAmount(children.lines, parentIndent);
				childrenContent = dedentedChildren.join('\n');
			}

			// Build full task content for new insertions
			const taskContent = buildTaskContent(
				parentLineForTarget,
				childrenContent ? childrenContent.split('\n') : []
			);

			collectedTasks.push({ taskText, taskContent, childrenContent });
			sourceEdits.push({ taskLine, scheduledLine: markTaskAsScheduled(lineText), children });
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

		// Phase 3: Mark source tasks as scheduled and remove transferred children
		// (bottom-to-top; terminal subtrees stay)
		for (const edit of sourceEdits) {
			editor.setLine(edit.taskLine, edit.scheduledLine);
			removeTransferredChildren(editor, edit.children);
		}

		const taskCount = taskLines.length;
		let message: string;
		if (taskCount === 1) {
			message = mergedCount > 0
				? 'Push task down: Task merged with existing in lower note.'
				: 'Push task down: Task pushed to lower note.';
		} else {
			const parts: string[] = [];
			if (newCount > 0) parts.push(`${newCount} new`);
			if (mergedCount > 0) parts.push(`${mergedCount} merged`);
			message = `Push task down: ${taskCount} tasks pushed to lower note (${parts.join(', ')}).`;
		}
		new Notice(message);
	} catch (e: any) {
		new Notice(`Push task down error: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('pushTaskDown error:', e);
	}
}
