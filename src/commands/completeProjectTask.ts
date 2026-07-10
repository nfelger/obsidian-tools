import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import {
	dedentLinesByAmount,
	extractTaskText,
	findTaskMatch,
	findTaskBlockEnd,
	insertUnderSubheading,
	parseTargetHeading,
	TaskMarker,
	TaskState
} from '../utils/tasks';
import { findChildrenBlockFromListItems, withoutTrailingEmptyLine } from '../utils/listItems';
import { countIndent } from '../utils/indent';
import { getActiveMarkdownFile, getListItems, findSelectedTaskLines, resolveProjectLinkAndFile } from '../utils/commandSetup';
import { isProjectNote, stripProjectPrefix } from '../utils/projects';
import { ObsidianLinkResolver } from '../utils/wikilinks';
import { NOTICE_TIMEOUT_ERROR } from '../config';

interface CompletionEntry {
	/** Task text without any [[Project]] prefix, for matching in the project note */
	taskText: string;
	/** Log entry lines: the [x] task line at zero indent plus its children */
	entryLines: string[];
}

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
		const entriesByProject = new Map<string, { file: TFile; entries: CompletionEntry[] }>();
		const sourceCompletions: Array<{
			taskLine: number;
			completedLine: string;
			children: { startLine: number; endLine: number } | null;
		}> = [];

		for (const taskLine of taskLines) {
			const lineText = editor.getLine(taskLine);

			const resolved = resolveProjectLinkAndFile(
				editor, listItems, taskLine, file.path, plugin.app.vault, resolver, plugin.settings, 'Complete project task'
			);
			if (!resolved) continue;
			const { link: projectLink, projectFile } = resolved;

			// Task text for matching: strip the [[Project]] prefix if present
			const taskText = stripProjectPrefix(extractTaskText(lineText), projectLink.basename);

			// Log entry: the task line rendered [x] at zero indent, link stripped
			const parentIndent = countIndent(lineText);
			const completedLine = new TaskMarker(TaskState.Completed).applyToLine(lineText);
			const strippedLine = TaskMarker.stripProjectLink(
				completedLine.slice(parentIndent),
				projectLink.basename
			);

			// All children move to the log entry — including completed
			// subtrees, which are part of the day's record
			const children = findChildrenBlockFromListItems(editor, listItems, taskLine);
			const childLines = children ? withoutTrailingEmptyLine(children.lines) : [];
			const entryLines = [strippedLine, ...dedentLinesByAmount(childLines, parentIndent)];

			const projectPath = projectLink.path;
			if (!entriesByProject.has(projectPath)) {
				entriesByProject.set(projectPath, { file: projectFile, entries: [] });
			}
			entriesByProject.get(projectPath)!.entries.push({ taskText, entryLines });

			sourceCompletions.push({
				taskLine,
				completedLine,
				children: children ? { startLine: children.startLine, endLine: children.endLine } : null
			});
		}

		if (sourceCompletions.length === 0) return;

		// Phase 2: Write each project note — remove the Todo copy, append the log
		const todoHeading = plugin.settings.projectNoteTaskTargetHeading;
		const logHeading = plugin.settings.logExtractionTargetHeading;
		const { level: logLevel } = parseTargetHeading(logHeading);
		const subHeadingPrefix = '#'.repeat(logLevel + 1);
		const mismatches: string[] = [];

		for (const [, { file: projectFile, entries }] of entriesByProject) {
			await plugin.app.vault.process(projectFile, (data: string) => {
				const lines = data.split('\n');
				const projectName = projectFile.basename;
				const logLines: string[] = [];

				for (const entry of entries) {
					logLines.push(...entry.entryLines);

					const match = findTaskMatch(lines, entry.taskText, {
						heading: todoHeading,
						includeCompleted: true
					});
					if (!match) {
						mismatches.push(`"${entry.taskText}" has no matching task in [[${projectName}]]`);
						continue;
					}
					if (match.state === TaskState.Completed) {
						mismatches.push(`"${entry.taskText}" is already completed in [[${projectName}]]`);
						continue;
					}
					// Remove the finished task and its subtree from Todo — the
					// log entry below is the record. Leftover children under the
					// copy (terminal subtrees left behind on take) move into the
					// log entry so their history isn't lost.
					const blockEnd = findTaskBlockEnd(lines, match.lineNumber);
					const copyIndent = countIndent(lines[match.lineNumber]);
					const leftovers = lines.slice(match.lineNumber + 1, blockEnd);
					logLines.push(...dedentLinesByAmount(leftovers, copyIndent));
					lines.splice(match.lineNumber, blockEnd - match.lineNumber);
				}

				// Append the log entry, grouped under one sub-heading per source note
				return insertUnderSubheading(lines, logLines, logHeading, `${subHeadingPrefix} [[${file.basename}]]`);
			});
		}

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

		const count = sourceCompletions.length;
		const projectNames = [...entriesByProject.values()].map(p => `[[${p.file.basename}]]`);
		const base = count === 1
			? `Complete project task: Task completed and logged to ${projectNames[0]}.`
			: `Complete project task: ${count} tasks completed and logged to ${projectNames.join(', ')}.`;
		if (mismatches.length > 0) {
			new Notice(`${base} Mismatches: ${mismatches.join('; ')}`, NOTICE_TIMEOUT_ERROR);
		} else {
			new Notice(base);
		}
	} catch (e: any) {
		new Notice(`Complete project task error: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('completeProjectTask error:', e);
	}
}
