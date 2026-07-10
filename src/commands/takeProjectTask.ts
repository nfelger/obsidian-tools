import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { markTaskAsScheduled, prepareTaskContentForTarget } from '../utils/tasks';
import type { ProjectTaskInsertItem } from '../types';
import {
	getActiveMarkdownFile,
	getOrCreateFile,
	getListItems,
	findSelectedTaskLines,
	getTransferableChildren,
	removeTransferredChildren
} from '../utils/commandSetup';
import { isProjectNote, getProjectName, parseProjectKeywords, insertProjectTasksInSection } from '../utils/projects';
import { PeriodicNoteService } from '../utils/periodicNotes';
import { getPeriodicConfig } from '../utils/periodicNoteCreator';
import { formatTransferNotice } from '../utils/notices';
import { NOTICE_TIMEOUT_ERROR } from '../config';

/**
 * Take tasks from a project note and place them in today's daily note.
 *
 * Behavior:
 * 1. Verify current file is a project note (top-level in projects folder)
 * 2. Find today's daily note (error if it doesn't exist)
 * 3. Insert each task as its own prefixed task under the configured heading
 *    (daily notes never group tasks under a collector — see the design spec)
 * 4. Merge into an existing live copy when one is found (alias-aware,
 *    including copies sitting under a manually created collector)
 * 5. Mark source task(s) as scheduled [<] and remove children
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
			new Notice('Take project task: This is not a project note.');
			return;
		}

		const projectName = getProjectName(file.path, plugin.settings);
		if (!projectName) {
			new Notice('Take project task: Cannot determine project name.');
			return;
		}

		// Find today's daily note
		const today = plugin.getToday ? plugin.getToday() : new Date();
		const noteService = new PeriodicNoteService(getPeriodicConfig());
		const dailyPath = noteService.formatDailyPath(today) + '.md';
		const dailyFile = await getOrCreateFile(plugin, dailyPath);
		if (!dailyFile) {
			new Notice(`Take project task: Could not create today's daily note: ${dailyPath}`);
			return;
		}

		const listItems = getListItems(plugin, file);

		const taskLines = findSelectedTaskLines(editor, listItems, 'Take project task');
		if (!taskLines) return;

		// Process tasks bottom-to-top so deferred source edits keep valid line numbers
		taskLines.sort((a, b) => b - a);

		// Parse collector keywords
		const keywords = parseProjectKeywords(plugin.settings.projectKeywords);

		// Phase 1: Collect task data (read-only — source edits are deferred
		// until the daily note write has succeeded)
		const collectedTasks: ProjectTaskInsertItem[] = [];
		const sourceEdits: Array<{
			taskLine: number;
			scheduledLine: string;
			children: ReturnType<typeof getTransferableChildren>;
		}> = [];

		for (const taskLine of taskLines) {
			const lineText = editor.getLine(taskLine);
			const children = getTransferableChildren(editor, listItems, taskLine);

			// Content is project-stripped — the routine renders the prefix,
			// since daily notes never group under a collector
			const { taskText, taskContent, childrenContent } = prepareTaskContentForTarget(
				lineText, children?.lines ?? [], { reopenStarted: true }
			);

			collectedTasks.push({
				taskText,
				taskContent,
				childrenContent,
				linkText: `[[${projectName}]]`
			});

			sourceEdits.push({ taskLine, scheduledLine: markTaskAsScheduled(lineText), children });
		}

		// Phase 2: Insert into target in original order
		// Tasks were collected bottom-to-top, reverse to restore original order
		collectedTasks.reverse();

		let mergedCount = 0;
		let newCount = 0;

		const targetHeading = plugin.settings.periodicNoteTaskTargetHeading;
		await plugin.app.vault.process(dailyFile, (data: string) => {
			const result = insertProjectTasksInSection(data, projectName, collectedTasks, {
				targetHeading,
				keywords,
				groupUnderCollector: false
			});
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
		new Notice(formatTransferNotice('Take project task', 'taken', 'daily note', taskCount, mergedCount, newCount));
	} catch (e: any) {
		new Notice(`Take project task error: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('takeProjectTask error:', e);
	}
}
