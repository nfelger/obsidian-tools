import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { PeriodicNoteService } from '../utils/periodicNotes';
import { getPeriodicConfig } from '../utils/periodicNoteCreator';
import {
	buildTaskContent,
	dedentLinesByAmount,
	extractTaskText,
	insertMultipleTasksWithDeduplication,
	markTaskAsScheduled,
	TaskMarker
} from '../utils/tasks';
import { detectCollectorContext, detectProjectContext, insertProjectTasksInSection, parseProjectKeywords } from '../utils/projects';
import { ObsidianLinkResolver } from '../utils/wikilinks';
import type { TaskInsertItem, ProjectTaskInsertItem } from '../types';
import { countIndent } from '../utils/indent';
import {
	getActiveMarkdownFile,
	getOrCreateFile,
	getListItems,
	findSelectedTaskLines,
	getCollectorChildGroups,
	getTransferableChildren,
	removeTransferredChildren,
	type TransferableChildren
} from '../utils/commandSetup';
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
				const groups = getCollectorChildGroups(editor, listItems, taskLine);
				const group = projectGroups.get(collectorCtx.projectName) ?? [];
				const decomposedRanges: Array<{ start: number; end: number }> = [];
				for (const g of groups) {
					if (!g.isTask) continue;
					const childIndent = countIndent(g.lines[0]);
					const strippedChildLine = g.lines[0].slice(childIndent);
					const childrenContentGroup = g.lines.length > 1
						? dedentLinesByAmount(g.lines.slice(1), childIndent).join('\n')
						: '';
					group.push({
						taskText: extractTaskText(strippedChildLine),
						taskContent: buildTaskContent(
							strippedChildLine,
							childrenContentGroup ? childrenContentGroup.split('\n') : []
						),
						childrenContent: childrenContentGroup,
						linkText: collectorCtx.linkText
					});
					decomposedRanges.push(g.range);
				}
				projectGroups.set(collectorCtx.projectName, group);
				decomposedRanges.reverse();
				const collectorChildren: TransferableChildren = { lines: [], removalRanges: decomposedRanges };
				sourceEdits.push({ taskLine, scheduledLine: markTaskAsScheduled(lineText), children: collectorChildren });
				continue;
			}

			const children = getTransferableChildren(editor, listItems, taskLine);

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
			const taskContent = buildTaskContent(
				parentLineStripped,
				childrenContent ? childrenContent.split('\n') : []
			);

			const ctx = detectProjectContext(editor, listItems, taskLine, file.path, resolver, plugin.settings);
			if (ctx) {
				const strippedLine = ctx.hasOwnPrefix
					? TaskMarker.replaceContent(parentLineStripped, ctx.strippedText)
					: parentLineStripped;
				const group = projectGroups.get(ctx.projectName) ?? [];
				group.push({
					taskText: ctx.strippedText,
					taskContent: buildTaskContent(strippedLine, childrenContent ? childrenContent.split('\n') : []),
					childrenContent,
					linkText: ctx.linkText
				});
				projectGroups.set(ctx.projectName, group);
			} else {
				collectedTasks.push({ taskText, taskContent, childrenContent });
			}
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
		let message: string;
		if (taskCount === 1) {
			message = mergedCount > 0
				? 'Pull task up: Task merged with existing in higher note.'
				: 'Pull task up: Task pulled to higher note.';
		} else {
			const parts: string[] = [];
			if (newCount > 0) parts.push(`${newCount} new`);
			if (mergedCount > 0) parts.push(`${mergedCount} merged`);
			message = `Pull task up: ${taskCount} tasks pulled to higher note (${parts.join(', ')}).`;
		}
		new Notice(message);
	} catch (e: any) {
		new Notice(`Pull task up error: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('pullTaskUp error:', e);
	}
}
