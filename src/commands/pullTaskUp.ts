import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { PeriodicNoteService } from '../utils/periodicNotes';
import { getPeriodicConfig } from '../utils/periodicNoteCreator';
import {
	insertMultipleTasksWithDeduplication,
	markTaskAsScheduled,
	prepareTaskContentForTarget
} from '../utils/tasks';
import {
	detectCollectorContext,
	detectProjectContext,
	insertProjectTasksInSection,
	parseProjectKeywords,
	routeTaskInsert
} from '../utils/projects';
import { ObsidianLinkResolver } from '../utils/wikilinks';
import type { TaskInsertItem, ProjectTaskInsertItem } from '../types';
import {
	getActiveMarkdownFile,
	getOrCreateFile,
	getListItems,
	findSelectedTaskLines,
	decomposeCollectorForTransfer,
	getTransferableChildren,
	removeTransferredChildren
} from '../utils/commandSetup';
import { formatTransferNotice } from '../utils/notices';
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

		const noteService = new PeriodicNoteService(getPeriodicConfig());
		const noteInfo = noteService.parseNoteType(file.basename);
		if (!noteInfo) {
			new Notice('Pull task up: This is not a periodic note.');
			return;
		}

		// Check if already at yearly level
		if (noteInfo.type === 'yearly') {
			new Notice('Pull task up: Cannot pull up from yearly note (already at highest level).');
			return;
		}

		// Calculate target path (higher level note)
		const higherPath = noteService.getHigherNotePath(noteInfo);
		if (!higherPath) {
			new Notice('Pull task up: Cannot determine target note.');
			return;
		}

		const targetPath = higherPath + '.md';
		const targetFile = await getOrCreateFile(plugin, targetPath);
		if (!targetFile) {
			new Notice(`Pull task up: Could not create target note: ${targetPath}`);
			return;
		}

		const listItems = getListItems(plugin, file);

		const taskLines = findSelectedTaskLines(editor, listItems, 'Pull task up');
		if (!taskLines) return;

		// Process tasks bottom-to-top so deferred source edits keep valid line numbers
		taskLines.sort((a, b) => b - a);

		// Phase 1: Collect task data (read-only — source edits are deferred
		// until the target write has succeeded)
		const resolver = new ObsidianLinkResolver(plugin.app.metadataCache, plugin.app.vault);
		const collectedTasks: TaskInsertItem[] = [];
		const projectGroups = new Map<string, ProjectTaskInsertItem[]>();
		const sourceEdits: Array<{
			taskLine: number;
			scheduledLine: string;
			children: ReturnType<typeof getTransferableChildren>;
		}> = [];

		for (const taskLine of taskLines) {
			const lineText = editor.getLine(taskLine);

			// A collector selected directly (e.g. "Push [[Project]]") is not a
			// task to transfer verbatim: decompose its task children into
			// individual project tasks instead, so each merges/groups on its
			// own merits in the target. Non-task children stay in the source.
			const collectorCtx = detectCollectorContext(lineText, file.path, resolver, plugin.settings);
			if (collectorCtx) {
				const decomposed = decomposeCollectorForTransfer(
					editor, listItems, taskLine, collectorCtx, { reopenStarted: false }
				);
				const group = projectGroups.get(decomposed.projectName) ?? [];
				group.push(...decomposed.items);
				projectGroups.set(decomposed.projectName, group);
				sourceEdits.push({ taskLine, scheduledLine: markTaskAsScheduled(lineText), children: decomposed.children });
				continue;
			}

			const children = getTransferableChildren(editor, listItems, taskLine);
			const prepared = prepareTaskContentForTarget(lineText, children?.lines ?? [], { reopenStarted: false });

			const ctx = detectProjectContext(editor, listItems, taskLine, file.path, resolver, plugin.settings);
			routeTaskInsert(ctx, prepared, projectGroups, collectedTasks);
			sourceEdits.push({ taskLine, scheduledLine: markTaskAsScheduled(lineText), children });
		}

		// Phase 2: Insert into target in original order
		// Tasks were collected bottom-to-top, reverse to restore original order
		collectedTasks.reverse();
		for (const items of projectGroups.values()) items.reverse();

		let mergedCount = 0;
		let newCount = 0;
		const targetHeading = plugin.settings.periodicNoteTaskTargetHeading;
		const keywords = parseProjectKeywords(plugin.settings.projectKeywords);
		const groupUnderCollector = true;
		await plugin.app.vault.process(targetFile, (data: string) => {
			let result = data;
			if (collectedTasks.length > 0) {
				const r = insertMultipleTasksWithDeduplication(result, collectedTasks, targetHeading);
				result = r.content;
				mergedCount += r.mergedCount;
				newCount += r.newCount;
			}
			for (const [name, items] of projectGroups) {
				const r = insertProjectTasksInSection(result, name, items, { targetHeading, keywords, groupUnderCollector });
				result = r.content;
				mergedCount += r.mergedCount;
				newCount += r.newCount;
			}
			return result;
		});

		// Phase 3: Mark source tasks as scheduled and remove transferred children
		// (bottom-to-top; terminal subtrees stay)
		for (const edit of sourceEdits) {
			editor.setLine(edit.taskLine, edit.scheduledLine);
			removeTransferredChildren(editor, edit.children);
		}

		const taskCount = taskLines.length;
		new Notice(formatTransferNotice('Pull task up', 'pulled', 'higher note', taskCount, mergedCount, newCount));
	} catch (e: any) {
		new Notice(`Pull task up error: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('pullTaskUp error:', e);
	}
}
