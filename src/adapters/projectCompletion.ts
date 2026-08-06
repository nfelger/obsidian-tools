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
	findSectionRange,
	findTaskBlockEnd,
	findTaskMatch,
	insertUnderSubheading,
	parseTargetHeading,
	TaskMarker,
	TaskState
} from '../utils/tasks';
import { countIndent } from '../utils/indent';
import { detectProjectContext } from '../utils/projects';
import { ObsidianLinkResolver } from '../utils/wikilinks';
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
 * The entry is dedented to zero indent and carries the project-stripped text;
 * all children travel with it, including completed subtrees — the log entry is
 * the day's record, so `selectTransferableChildLines` does not apply.
 *
 * @param lineText - The task line as it appears in the source, with indent
 * @param childLines - The task's children, original indentation
 * @param taskText - The task's text with its project prefix already stripped
 *   (`stripResolvedProjectPrefix`, or a resolved `ProjectTaskContext`); the
 *   log line is rendered from it, so the prefix cannot survive into the
 *   project note in a form the caller didn't recognise
 * @returns The log entry and the source line rendered `[x]` in place
 */
export function buildCompletionEntry(
	lineText: string,
	childLines: string[],
	taskText: string
): { entry: CompletionEntry; completedLine: string } {
	const parentIndent = countIndent(lineText);
	const completedLine = new TaskMarker(TaskState.Completed).applyToLine(lineText);
	const strippedLine = TaskMarker.replaceContent(completedLine.slice(parentIndent), taskText);

	return {
		entry: { taskText, entryLines: [strippedLine, ...dedentLinesByAmount(childLines, parentIndent)] },
		completedLine
	};
}

/** What happened to one completion when it reached its project note. */
export type CompletionOutcome =
	/** Logged; the Todo copy was found live and removed — the log is the record */
	| 'removed'
	/** Logged; the project note never listed this task */
	| 'no-copy'
	/** Logged; the copy was already `[x]` in Todo and was left untouched */
	| 'already-completed'
	/** Not logged: this completion is already in the project's log */
	| 'already-logged';

export interface CompletionResult {
	/** The entry this result belongs to, so callers can correlate by identity */
	entry: CompletionEntry;
	projectName: string;
	outcome: CompletionOutcome;
}

/**
 * The sub-heading completions from one source note are grouped under, one
 * level below the log heading (e.g. "### [[2026-07-02 Thu]]").
 */
export function completionSubHeading(logHeading: string, sourceBasename: string): string {
	const { level } = parseTargetHeading(logHeading);
	return `${'#'.repeat(level + 1)} [[${sourceBasename}]]`;
}

/**
 * Whether a project note's log already holds this completion for this source
 * note: a completed task with the same text inside the source note's
 * sub-section.
 *
 * This is what makes completing a task idempotent — the log entry itself is
 * the record that the work was filed, so a repeat run (the command's `[x]`
 * waking the auto-move extension, an undo followed by a re-tick) writes
 * nothing instead of logging twice. Scoped to the sub-heading, so the same
 * task completed on another day still gets its own entry.
 */
export function isCompletionLogged(
	projectContent: string | string[],
	taskText: string,
	logHeading: string,
	subHeading: string
): boolean {
	if (!taskText) return false;

	const lines = Array.isArray(projectContent) ? projectContent : projectContent.split('\n');
	const section = findSectionRange(lines, logHeading);
	if (!section) return false;

	const body = lines.slice(section.start + 1, section.end);
	const sub = findSectionRange(body, subHeading);
	if (!sub) return false;

	for (let i = sub.start + 1; i < sub.end; i++) {
		const marker = TaskMarker.fromLine(body[i]);
		if (marker?.state === TaskState.Completed && extractTaskText(body[i]) === taskText) return true;
	}
	return false;
}

/**
 * The copy outcomes worth telling the user about.
 *
 * A task the project never listed is not one of them: since completions are
 * logged whether or not the project listed the task, work invented in the
 * daily note has no copy by definition, and reporting it would flag the
 * ordinary case as a problem. A copy left `[x]` in Todo is worth a word — it
 * is a duplicate the user may want to tidy.
 */
function describeMismatches(results: CompletionResult[]): string[] {
	return results
		.filter(r => r.outcome === 'already-completed')
		.map(r => `"${r.entry.taskText}" is already completed in [[${r.projectName}]]`);
}

/**
 * Write completions into their project notes: remove each task's copy from the
 * Todo section (the log is the record) and append the log entries under one
 * sub-heading per source note.
 *
 * One `vault.process` per project note. A missing copy, or one already `[x]`,
 * is reported but never fatal — the log entry is written either way, so a task
 * invented in the daily note is filed to its project like any other.
 *
 * @param plugin - BulletFlow plugin instance
 * @param sourceBasename - Basename of the note the tasks were completed in
 * @param entriesByProject - Completions grouped per project note
 * @returns One result per entry, in write order
 */
export async function writeProjectCompletions(
	plugin: BulletFlowPlugin,
	sourceBasename: string,
	entriesByProject: CompletionsByProject
): Promise<CompletionResult[]> {
	const todoHeading = plugin.settings.projectNoteTaskTargetHeading;
	const logHeading = plugin.settings.logExtractionTargetHeading;
	const results: CompletionResult[] = [];

	const subHeading = completionSubHeading(logHeading, sourceBasename);

	for (const [, { file: projectFile, entries }] of entriesByProject) {
		await plugin.app.vault.process(projectFile, (data: string) => {
			const lines = data.split('\n');
			const projectName = projectFile.basename;
			const logLines: string[] = [];

			for (const entry of entries) {
				// Already in this note's log section: the completion is on the
				// record, so a repeat run adds nothing — not the entry, and not
				// the Todo removal either.
				if (isCompletionLogged(lines, entry.taskText, logHeading, subHeading)) {
					results.push({ entry, projectName, outcome: 'already-logged' });
					continue;
				}

				logLines.push(...entry.entryLines);

				const match = findTaskMatch(lines, entry.taskText, {
					heading: todoHeading,
					includeCompleted: true
				});
				if (!match) {
					results.push({ entry, projectName, outcome: 'no-copy' });
					continue;
				}
				if (match.state === TaskState.Completed) {
					results.push({ entry, projectName, outcome: 'already-completed' });
					continue;
				}
				results.push({ entry, projectName, outcome: 'removed' });
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

			// Nothing new to file — leave the note exactly as it was
			if (logLines.length === 0) return lines.join('\n');

			// Append the log entry, grouped under one sub-heading per source note
			return insertUnderSubheading(lines, logLines, logHeading, subHeading);
		});
	}

	return results;
}

/**
 * Report the outcome of one or more completions, appending mismatch details
 * when any are worth reporting (see `describeMismatches`). Both the command
 * and the automatic path go through here, so they say the same thing about
 * the same outcome.
 */
export function notifyCompletion(projectNames: string[], results: CompletionResult[]): void {
	const mismatches = describeMismatches(results);
	const rendered = projectNames.map(name => `[[${name}]]`);
	const logged = results.filter(r => r.outcome !== 'already-logged').length;

	let base: string;
	if (logged === 0) {
		base = results.length === 1
			? `Complete project task: Already logged in ${rendered[0]}.`
			: `Complete project task: All ${results.length} completions already logged in ${rendered.join(', ')}.`;
	} else {
		base = logged === 1
			? `Complete project task: Task completed and logged to ${rendered[0]}.`
			: `Complete project task: ${logged} tasks completed and logged to ${rendered.join(', ')}.`;
	}

	if (mismatches.length > 0) {
		new Notice(`${base} Mismatches: ${mismatches.join('; ')}`, NOTICE_TIMEOUT_ERROR);
	} else {
		new Notice(base);
	}
}

/** What happened when a ticked task was checked for project membership. */
export type AutoCompletionOutcome =
	/** Not a project task, or this completion is already in the project's log */
	| 'skipped'
	/** The project note was updated; the task's children now live there */
	| 'completed'
	/** The project write failed; the source must be left untouched */
	| 'failed';

/**
 * Complete a single ticked task in its project note, without an editor.
 *
 * The task qualifies when it carries its own resolvable `[[Project]]` prefix
 * (`detectProjectContext` semantics) — a project link somewhere in an ancestor
 * bullet is not enough, because the ticked line would not be the task the
 * project note knows about.
 *
 * Whether the project note ever listed the task is deliberately *not* a
 * condition: like the command, this logs the completion either way, so work
 * invented in the daily note is filed to its project too. Repeat runs are held
 * off by `isCompletionLogged` instead — the entry already in the project's log
 * is the record that this completion was filed.
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
	if (!ctx || !ctx.hasOwnPrefix) return 'skipped';

	const projectFile = plugin.app.vault.getAbstractFileByPath(ctx.path) as TFile;
	if (!projectFile) return 'skipped';

	try {
		// ctx.strippedText comes from the resolved prefix, so every link form
		// the project resolves through is stripped the same way
		const { entry } = buildCompletionEntry(lines[taskLine], childLines, ctx.strippedText);

		const results = await writeProjectCompletions(
			plugin,
			file.basename,
			new Map([[ctx.path, { file: projectFile, entries: [entry] }]])
		);
		if (results.every(r => r.outcome === 'already-logged')) return 'skipped';

		notifyCompletion([ctx.projectName], results);
		return 'completed';
	} catch (e: any) {
		new Notice(`Complete project task error: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('completeProjectTaskAtLine error:', e);
		return 'failed';
	}
}
