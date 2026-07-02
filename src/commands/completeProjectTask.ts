import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import {
	dedentLinesByAmount,
	extractTaskText,
	findTaskMatch,
	insertBlockAfterHeading,
	parseTargetHeading,
	TaskMarker,
	TaskState
} from '../utils/tasks';
import { findChildrenBlockFromListItems, withoutTrailingEmptyLine } from '../utils/listItems';
import { countIndent } from '../utils/indent';
import { getActiveMarkdownFile, getListItems, findSelectedTaskLines } from '../utils/commandSetup';
import { findProjectLinkInAncestors, isProjectNote, stripProjectPrefix } from '../utils/projects';
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
 * Closes the project loop opened by takeProjectTask:
 * 1. In the project note: mark the matching Todo-section copy [x] and append
 *    a log entry (extract-log shape) copying the completed task and children.
 * 2. In the source note: mark the task [x] in place — children stay; in daily
 *    notes the auto-move extension carries it to the log as usual.
 *
 * Mismatches (no matching copy / already [x]) still log and complete the
 * source; the log is the paper trail, the [<] flip is best-effort.
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

		// Phase 1: Collect (read-only). Group entries by project file. No source
		// lines are deleted, so line numbers stay valid in document order.
		const entriesByProject = new Map<string, { file: TFile; entries: CompletionEntry[] }>();
		const sourceCompletions: Array<{ taskLine: number; completedLine: string }> = [];

		for (const taskLine of taskLines) {
			const lineText = editor.getLine(taskLine);

			const projectLink = findProjectLinkInAncestors(
				editor,
				listItems,
				taskLine,
				file.path,
				resolver,
				plugin.settings
			);
			if (!projectLink) {
				new Notice(`Complete project task: No project link found for task on line ${taskLine + 1}.`);
				continue;
			}

			const projectFile = plugin.app.vault.getAbstractFileByPath(projectLink.link.path) as TFile;
			if (!projectFile) {
				new Notice(`Complete project task: Project note not found: ${projectLink.link.path}`);
				continue;
			}

			// Task text for matching: strip the [[Project]] prefix if present
			const taskText = stripProjectPrefix(extractTaskText(lineText), projectLink.link.basename);

			// Log entry: the task line rendered [x] at zero indent, link stripped
			const parentIndent = countIndent(lineText);
			const completedLine = new TaskMarker(TaskState.Completed).applyToLine(lineText);
			const strippedLine = TaskMarker.stripProjectLink(
				completedLine.slice(parentIndent),
				projectLink.link.basename
			);

			// All children are copied verbatim — this is a log entry, not a
			// transfer, so completed subtrees are part of the record too
			const children = findChildrenBlockFromListItems(editor, listItems, taskLine);
			const childLines = children ? withoutTrailingEmptyLine(children.lines) : [];
			const entryLines = [strippedLine, ...dedentLinesByAmount(childLines, parentIndent)];

			const projectPath = projectLink.link.path;
			if (!entriesByProject.has(projectPath)) {
				entriesByProject.set(projectPath, { file: projectFile, entries: [] });
			}
			entriesByProject.get(projectPath)!.entries.push({ taskText, entryLines });

			sourceCompletions.push({ taskLine, completedLine });
		}

		if (sourceCompletions.length === 0) return;

		// Phase 2: Write each project note — flip the Todo copy, append the log
		const todoHeading = plugin.settings.projectNoteTaskTargetHeading;
		const logHeading = plugin.settings.logExtractionTargetHeading;
		const { level: logLevel } = parseTargetHeading(logHeading);
		const subHeadingPrefix = '#'.repeat(logLevel + 1);
		const mismatches: string[] = [];

		for (const [, { file: projectFile, entries }] of entriesByProject) {
			await plugin.app.vault.process(projectFile, (data: string) => {
				const lines = data.split('\n');
				const projectName = projectFile.basename;

				for (const entry of entries) {
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
					lines[match.lineNumber] = new TaskMarker(TaskState.Completed).applyToLine(lines[match.lineNumber]);
				}

				// Append the log entry
				const entryLines = entries.flatMap(e => e.entryLines);
				const blockLines = ['', `${subHeadingPrefix} [[${file.basename}]]`, ''].concat(entryLines);
				return insertBlockAfterHeading(lines, blockLines, logHeading);
			});
		}

		// Phase 3: Complete the source tasks in place
		for (const completion of sourceCompletions) {
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
