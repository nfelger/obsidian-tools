import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import {
	dedentLinesByAmount,
	extractTaskText,
	findTaskMatch,
	findSectionRange,
	parseTargetHeading,
	TaskMarker,
	TaskState
} from '../utils/tasks';
import { findChildrenBlockFromListItems } from '../utils/listItems';
import { countIndent, detectIndentUnit, convertIndentUnit } from '../utils/indent';
import { getActiveMarkdownFile, getListItems, findSelectedTaskLines } from '../utils/commandSetup';
import { findProjectLinkInAncestors, isProjectNote } from '../utils/projects';
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
		const entriesByProject = new Map<string, { file: TFile; projectName: string; entries: CompletionEntry[] }>();
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
			let taskText = extractTaskText(lineText);
			const linkPrefix = `[[${projectLink.link.basename}]] `;
			if (taskText.startsWith(linkPrefix)) {
				taskText = taskText.slice(linkPrefix.length);
			}

			// Log entry: the task line rendered [x] at zero indent, link stripped
			const parentIndent = countIndent(lineText);
			const marker = TaskMarker.fromLine(lineText);
			// Unreachable: findSelectedTaskLines only returns incomplete task lines
			if (!marker) continue;
			const completedLine = marker.toCompleted().applyToLine(lineText);
			const strippedLine = TaskMarker.stripProjectLink(
				completedLine.slice(parentIndent),
				projectLink.link.basename
			);

			// All children are copied verbatim — this is a log entry, not a
			// transfer, so completed subtrees are part of the record too
			const children = findChildrenBlockFromListItems(editor, listItems, taskLine);
			let childLines = children ? children.lines.slice() : [];
			if (childLines.length > 0 && childLines[childLines.length - 1] === '') {
				childLines = childLines.slice(0, -1);
			}
			const entryLines = [strippedLine, ...dedentLinesByAmount(childLines, parentIndent)];

			const projectPath = projectLink.link.path;
			if (!entriesByProject.has(projectPath)) {
				entriesByProject.set(projectPath, {
					file: projectFile,
					projectName: projectLink.link.basename,
					entries: []
				});
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

		for (const [, { file: projectFile, projectName, entries }] of entriesByProject) {
			await plugin.app.vault.process(projectFile, (data: string) => {
				let content = data;

				for (const entry of entries) {
					const match = findTaskMatch(content, entry.taskText, todoHeading);
					if (!match) {
						mismatches.push(`"${entry.taskText}" has no matching task in [[${projectName}]]`);
						continue;
					}
					if (match.state === TaskState.Completed) {
						mismatches.push(`"${entry.taskText}" is already completed in [[${projectName}]]`);
						continue;
					}
					const lines = content.split('\n');
					const lineMarker = TaskMarker.fromLine(lines[match.lineNumber]);
					if (!lineMarker) continue;
					lines[match.lineNumber] = lineMarker.toCompleted().applyToLine(lines[match.lineNumber]);
					content = lines.join('\n');
				}

				// Append the log entry after the heading (reverse-chronological),
				// re-rendered in the project note's own indent unit
				const contentLines = content.split('\n');
				const targetUnit = detectIndentUnit(contentLines);
				const rawEntryLines = entries.flatMap(e => e.entryLines);
				const entryLines = targetUnit ? convertIndentUnit(rawEntryLines, targetUnit) : rawEntryLines;
				const blockLines = ['', `${subHeadingPrefix} [[${file.basename}]]`, ''].concat(entryLines);

				const range = findSectionRange(contentLines, logHeading);
				if (range) {
					contentLines.splice(range.start + 1, 0, ...blockLines);
				} else {
					if (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() !== '') {
						contentLines.push('');
					}
					contentLines.push(logHeading, ...blockLines);
				}
				return contentLines.join('\n');
			});
		}

		// Phase 3: Complete the source tasks in place
		for (const completion of sourceCompletions) {
			editor.setLine(completion.taskLine, completion.completedLine);
		}

		const count = sourceCompletions.length;
		const projectNames = [...entriesByProject.values()].map(p => `[[${p.projectName}]]`);
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
