import { Notice } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { findChildrenBlockFromListItems, withoutTrailingEmptyLine } from '../utils/listItems';
import { getActiveMarkdownFile, getListItems, findSelectedTaskLines, resolveProjectLinkAndFile } from '../utils/commandSetup';
import { isProjectNote } from '../utils/projects';
import { buildCompletionEntry, describeMismatch, notifyCompletion, writeProjectCompletions, type CompletionsByProject } from '../utils/projectCompletion';
import { ObsidianLinkResolver } from '../utils/wikilinks';
import { NOTICE_TIMEOUT_ERROR } from '../config';

/**
 * Complete a project task from the daily note (or any non-project note).
 *
 * Closes the project loop opened by takeProjectTask, extract-log style:
 * 1. In the project note: remove the matching Todo-section copy (the log is
 *    the record) and append a log entry with the completed task and its
 *    children, grouped under one sub-heading per source note.
 * 2. In the source note: mark the task [x] in place and move its children
 *    to the project log; in daily notes the auto-move extension carries the
 *    task line to the log as usual.
 *
 * Mismatches (no matching copy / already [x] in Todo) still log and complete
 * the source; the log is the paper trail, the Todo removal is best-effort.
 *
 * @param plugin - BulletFlow plugin instance
 */
export async function completeProjectTask(plugin: BulletFlowPlugin): Promise<void> {
	try {
		const context = getActiveMarkdownFile(plugin);
		if (!context) return;

		const { editor, file } = context;

		if (isProjectNote(file.path, plugin.settings)) {
			new Notice('Complete project task: Already in a project note.');
			return;
		}

		const listItems = getListItems(plugin, file);
		const resolver = new ObsidianLinkResolver(plugin.app.metadataCache, plugin.app.vault);

		const taskLines = findSelectedTaskLines(editor, listItems, 'Complete project task');
		if (!taskLines) return;

		// Phase 1: Collect (read-only). Group entries by project file.
		const entriesByProject: CompletionsByProject = new Map();
		const sourceCompletions: Array<{
			taskLine: number;
			completedLine: string;
			children: { startLine: number; endLine: number } | null;
		}> = [];

		for (const taskLine of taskLines) {
			const resolved = resolveProjectLinkAndFile(
				editor, listItems, taskLine, file.path, plugin.app.vault, resolver, plugin.settings, 'Complete project task'
			);
			if (!resolved) continue;
			const { link: projectLink, projectFile } = resolved;

			// All children move to the log entry — including completed
			// subtrees, which are part of the day's record
			const children = findChildrenBlockFromListItems(editor, listItems, taskLine);
			const childLines = children ? withoutTrailingEmptyLine(children.lines) : [];
			const { entry, completedLine } = buildCompletionEntry(
				editor.getLine(taskLine), childLines, projectLink.basename
			);

			const projectPath = projectLink.path;
			if (!entriesByProject.has(projectPath)) {
				entriesByProject.set(projectPath, { file: projectFile, entries: [] });
			}
			entriesByProject.get(projectPath)!.entries.push(entry);

			sourceCompletions.push({
				taskLine,
				completedLine,
				children: children ? { startLine: children.startLine, endLine: children.endLine } : null
			});
		}

		if (sourceCompletions.length === 0) return;

		// Phase 2: Write each project note — remove the Todo copy, append the log
		const results = await writeProjectCompletions(plugin, file.basename, entriesByProject);

		// Phase 3: Complete the source tasks in place and move their children
		// out. Deleting children shifts later line numbers, so edits run
		// bottom-to-top.
		for (const completion of [...sourceCompletions].reverse()) {
			if (completion.children) {
				editor.replaceRange(
					'',
					{ line: completion.children.startLine, ch: 0 },
					{ line: completion.children.endLine, ch: 0 }
				);
			}
			editor.setLine(completion.taskLine, completion.completedLine);
		}

		notifyCompletion(
			sourceCompletions.length,
			[...entriesByProject.values()].map(p => p.file.basename),
			results.filter(r => r.outcome !== 'removed').map(describeMismatch)
		);
	} catch (e: any) {
		new Notice(`Complete project task error: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('completeProjectTask error:', e);
	}
}
