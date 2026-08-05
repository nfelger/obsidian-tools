/**
 * The project-note side of completing a project task.
 *
 * Shared by the `Complete project task` command (explicit, multi-select) and
 * by the auto-move extension, which runs the same logic transparently when a
 * project task is ticked in a daily note.
 */

import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import {
	dedentLinesByAmount,
	extractTaskText,
	findTaskBlockEnd,
	findTaskMatch,
	insertUnderSubheading,
	parseTargetHeading,
	TaskMarker,
	TaskState
} from './tasks';
import { countIndent } from './indent';
import { detectProjectContext, stripProjectPrefix } from './projects';
import { ObsidianLinkResolver } from './wikilinks';
import { NOTICE_TIMEOUT_ERROR } from '../config';

/** One completed task headed for a project note's log. */
export interface CompletionEntry {
	/** Task text without any [[Project]] prefix, for matching in the project note */
	taskText: string;
	/** Log entry lines: the [x] task line at zero indent plus its children */
	entryLines: string[];
}

/** Completions destined for one project note, keyed by project path. */
export type CompletionsByProject = Map<string, { file: TFile; entries: CompletionEntry[] }>;

/**
 * Render a completed task as a project log entry.
 *
 * The entry is dedented to zero indent and stripped of its project-link
 * prefix; all children travel with it, including completed subtrees — the log
 * entry is the day's record, so `selectTransferableChildLines` does not apply.
 *
 * @param lineText - The task line as it appears in the source, with indent
 * @param childLines - The task's children, original indentation
 * @param projectName - Project note basename, for prefix stripping
 * @returns The log entry and the source line rendered `[x]` in place
 */
export function buildCompletionEntry(
	lineText: string,
	childLines: string[],
	projectName: string
): { entry: CompletionEntry; completedLine: string } {
	const taskText = stripProjectPrefix(extractTaskText(lineText), projectName);

	const parentIndent = countIndent(lineText);
	const completedLine = new TaskMarker(TaskState.Completed).applyToLine(lineText);
	const strippedLine = TaskMarker.stripProjectLink(
		completedLine.slice(parentIndent),
		projectName
	);

	return {
		entry: { taskText, entryLines: [strippedLine, ...dedentLinesByAmount(childLines, parentIndent)] },
		completedLine
	};
}

/**
 * Write completions into their project notes: remove each task's copy from the
 * Todo section (the log is the record) and append the log entries under one
 * sub-heading per source note.
 *
 * One `vault.process` per project note. Mismatches (no matching copy, or a
 * copy already `[x]`) are reported, not fatal — the log entry is still written.
 *
 * @param plugin - BulletFlow plugin instance
 * @param sourceBasename - Basename of the note the tasks were completed in
 * @param entriesByProject - Completions grouped per project note
 * @returns Human-readable mismatch descriptions, empty when all copies matched
 */
export async function writeProjectCompletions(
	plugin: BulletFlowPlugin,
	sourceBasename: string,
	entriesByProject: CompletionsByProject
): Promise<string[]> {
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
			return insertUnderSubheading(lines, logLines, logHeading, `${subHeadingPrefix} [[${sourceBasename}]]`);
		});
	}

	return mismatches;
}

/**
 * Report the outcome of one or more completions, appending mismatch details
 * when any occurred.
 */
export function notifyCompletion(count: number, projectNames: string[], mismatches: string[]): void {
	const rendered = projectNames.map(name => `[[${name}]]`);
	const base = count === 1
		? `Complete project task: Task completed and logged to ${rendered[0]}.`
		: `Complete project task: ${count} tasks completed and logged to ${rendered.join(', ')}.`;

	if (mismatches.length > 0) {
		new Notice(`${base} Mismatches: ${mismatches.join('; ')}`, NOTICE_TIMEOUT_ERROR);
	} else {
		new Notice(base);
	}
}

/** What happened when a ticked task was checked for project membership. */
export type AutoCompletionOutcome =
	/** No project task to close — nothing was written */
	| 'not-project'
	/** The project note was updated; the task's children now live there */
	| 'completed'
	/** The project write failed; the source must be left untouched */
	| 'failed';

/**
 * Complete a single ticked task in its project note, without an editor.
 *
 * The task qualifies only when it carries its own resolvable `[[Project]]`
 * prefix (`detectProjectContext` semantics) — a project link somewhere in an
 * ancestor bullet is not enough, because the ticked line would not be the task
 * the project note knows about.
 *
 * It must also still have a live copy in the project's Todo section. Unlike
 * the explicit command — where a missing copy is logged anyway, because the
 * user asked for this task to be closed — an automatic run with nothing to
 * close writes nothing at all. That keeps a ticked checkbox from surprising
 * the user with a project log entry, and makes running the command in a daily
 * note idempotent: the completion it just wrote is not written twice when the
 * `[x]` it leaves behind wakes the auto-move extension.
 *
 * @param plugin - BulletFlow plugin instance
 * @param file - The note the task was ticked in
 * @param docText - Current text of that note
 * @param taskLine - Line number of the ticked task
 * @param childLines - The task's children, which move to the project log
 */
export async function completeProjectTaskAtLine(
	plugin: BulletFlowPlugin,
	file: TFile,
	docText: string,
	taskLine: number,
	childLines: string[]
): Promise<AutoCompletionOutcome> {
	const lines = docText.split('\n');
	const resolver = new ObsidianLinkResolver(plugin.app.metadataCache, plugin.app.vault);
	// No list items: with no hierarchy to walk, detectProjectContext considers
	// only the line's own prefix — which is exactly what qualifies here
	const ctx = detectProjectContext(
		{ getLine: (line: number) => lines[line] ?? '' },
		[],
		taskLine,
		file.path,
		resolver,
		plugin.settings
	);
	if (!ctx || !ctx.hasOwnPrefix) return 'not-project';

	const projectFile = plugin.app.vault.getAbstractFileByPath(ctx.path) as TFile;
	if (!projectFile) return 'not-project';

	try {
		const { entry } = buildCompletionEntry(lines[taskLine], childLines, ctx.projectName);

		const projectContent = await plugin.app.vault.read(projectFile);
		const live = findTaskMatch(projectContent, entry.taskText, {
			heading: plugin.settings.projectNoteTaskTargetHeading
		});
		if (!live) return 'not-project';

		const mismatches = await writeProjectCompletions(
			plugin,
			file.basename,
			new Map([[ctx.path, { file: projectFile, entries: [entry] }]])
		);
		notifyCompletion(1, [ctx.projectName], mismatches);
		return 'completed';
	} catch (e: any) {
		new Notice(`Complete project task error: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('completeProjectTaskAtLine error:', e);
		return 'failed';
	}
}
