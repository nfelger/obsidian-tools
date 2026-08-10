import { Notice } from 'obsidian';
import type { Editor, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { markTaskAsScheduled, prepareTaskContentForTarget } from '../utils/tasks';
import type { ListItem, PeriodicGranularity, ProjectTaskInsertItem } from '../types';
import {
	getActiveMarkdownFile,
	getOrCreateFile,
	getListItems,
	findSelectedTaskLines,
	getTransferableChildren,
	removeTransferredChildren
} from '../adapters/commandSetup';
import { promptForPeriod } from '../adapters/periodPicker';
import { isProjectNote, getProjectName, parseProjectKeywords, insertProjectTasksInSection } from '../utils/projects';
import { PeriodicNoteService } from '../utils/periodicNotes';
import { getPeriodicConfig } from '../adapters/periodicNoteCreator';
import { formatTransferNotice } from '../utils/notices';
import { NOTICE_TIMEOUT_ERROR, PERIOD_CHOICES, periodNoteLabel } from '../config';

/**
 * Ask which period the tasks should go to — showing the note each one would
 * write to — and get that note, creating it when it doesn't exist yet.
 *
 * @returns The chosen period and its note, or null if the user dismissed the
 *   picker or the note could not be created (notice already shown)
 */
async function resolveTargetNote(
	plugin: BulletFlowPlugin,
	today: Date
): Promise<{ granularity: PeriodicGranularity; targetFile: TFile } | null> {
	const noteService = new PeriodicNoteService(getPeriodicConfig());

	const hints: Partial<Record<PeriodicGranularity, string>> = {};
	for (const { granularity } of PERIOD_CHOICES) {
		hints[granularity] = noteService.formatPeriodPath(today, granularity).split('/').pop()!;
	}

	const granularity = await promptForPeriod(plugin.app, hints);
	if (!granularity) return null;

	const targetPath = noteService.formatPeriodPath(today, granularity) + '.md';
	const targetFile = await getOrCreateFile(plugin, targetPath);
	if (!targetFile) {
		new Notice(`Take project task: Could not create target note: ${targetPath}`);
		return null;
	}

	return { granularity, targetFile };
}

/** A source task's deferred edit: scheduled marker plus the children it loses. */
interface TakeSourceEdit {
	taskLine: number;
	scheduledLine: string;
	children: ReturnType<typeof getTransferableChildren>;
}

/**
 * Read the selected tasks and their transferable children, in the order the
 * lines were given (bottom-to-top). Nothing is written: the source edits are
 * returned for the caller to apply once the target write has succeeded.
 */
function collectTasksToTake(
	editor: Editor,
	listItems: ListItem[],
	taskLines: number[],
	projectName: string
): { collectedTasks: ProjectTaskInsertItem[]; sourceEdits: TakeSourceEdit[] } {
	const collectedTasks: ProjectTaskInsertItem[] = [];
	const sourceEdits: TakeSourceEdit[] = [];

	for (const taskLine of taskLines) {
		const lineText = editor.getLine(taskLine);
		const children = getTransferableChildren(editor, listItems, taskLine);

		// Content is project-stripped — the routine renders the prefix or the
		// collector, depending on what the target note allows
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

	return { collectedTasks, sourceEdits };
}

/**
 * Take tasks from a project note and place them in a periodic note.
 *
 * Behavior:
 * 1. Verify current file is a project note (top-level in projects folder)
 * 2. Collect the selected tasks and their transferable children (read-only)
 * 3. Ask which period to take them to — day, week, month or year — and find
 *    the note of that period containing today (creating it if needed)
 * 4. Insert each task under the configured heading, grouped under a collector
 *    only where the target allows it (daily notes never group — see the
 *    design spec)
 * 5. Merge into an existing live copy when one is found (alias-aware,
 *    including copies sitting under a manually created collector)
 * 6. Mark source task(s) as scheduled [<] and remove children
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

		const listItems = getListItems(plugin, file);

		const taskLines = findSelectedTaskLines(editor, listItems, 'Take project task');
		if (!taskLines) return;

		// Process tasks bottom-to-top so deferred source edits keep valid line numbers
		taskLines.sort((a, b) => b - a);

		// Parse collector keywords
		const keywords = parseProjectKeywords(plugin.settings.projectKeywords);

		// Phase 1: Collect task data (read-only — source edits are deferred
		// until the target note write has succeeded)
		const { collectedTasks, sourceEdits } = collectTasksToTake(editor, listItems, taskLines, projectName);

		// Ask where the tasks go. Nothing has been written yet, so dismissing
		// the picker leaves both notes exactly as they were.
		const today = plugin.getToday ? plugin.getToday() : new Date();
		const target = await resolveTargetNote(plugin, today);
		if (!target) return;
		const { granularity, targetFile } = target;

		// Phase 2: Insert into target in original order
		// Tasks were collected bottom-to-top, reverse to restore original order
		collectedTasks.reverse();

		let mergedCount = 0;
		let newCount = 0;

		const targetHeading = plugin.settings.periodicNoteTaskTargetHeading;
		await plugin.app.vault.process(targetFile, (data: string) => {
			const result = insertProjectTasksInSection(data, projectName, collectedTasks, {
				targetHeading,
				keywords
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
		const destination = periodNoteLabel(granularity);
		new Notice(formatTransferNotice('Take project task', 'taken', destination, taskCount, mergedCount, newCount));
	} catch (e: any) {
		new Notice(`Take project task error: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('takeProjectTask error:', e);
	}
}
