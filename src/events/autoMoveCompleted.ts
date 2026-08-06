/**
 * CM6 extension that auto-moves completed and started tasks from ## Todo to ## Log in daily notes.
 *
 * Design: detectAutoMoveCandidate checks if any change might have completed/started a task.
 * If so, schedules runAutoMove via setTimeout(0) to run after CM6 finishes its transaction.
 * runAutoMove re-scans the document fresh — it never uses a line *number* captured at
 * detection time, avoiding the stale-reference bug where intervening edits shift them.
 * The ticked line's text does travel, since the Log pass has no other way to tell which
 * of the section's accumulated completed tasks the user just ticked.
 *
 * A ticked task carrying a [[Project]] prefix is completed in its project note
 * on the way, running the same logic as the Complete project task command
 * (see src/adapters/projectCompletion.ts) so the loop closes without a keystroke.
 * That applies in both sections: a task ticked in Todo is filed to its project
 * and moved under Log, and one ticked where it already sits in Log is filed
 * without moving.
 */

import { EditorView, ViewUpdate } from '@codemirror/view';
import { Annotation, Extension } from '@codemirror/state';
import type { ChangeSet, Text } from '@codemirror/state';
import { editorInfoField, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { PeriodicNoteService } from '../utils/periodicNotes';
import { getPeriodicConfig } from '../adapters/periodicNoteCreator';
import { TaskMarker, TaskState } from '../utils/tasks';
import {
	computeAutoMove,
	computeLineRangeRemoval,
	findAutoMoveBlock,
	findAutoMoveTriggerLine,
	findCompletedTaskLineByText
} from '../utils/autoMove';
import { completeProjectTaskAtLine, type AutoCompletionOutcome } from '../adapters/projectCompletion';

const autoMoveAnnotation = Annotation.define<boolean>();

/** A CM6 change set in the shape computeAutoMove produces. */
type AutoMoveChanges = Array<{ from: number; to: number; insert: string }>;

/**
 * The document an auto-move run operates on. Keeps the run testable without a
 * CM6 view, and re-reads the text on demand — a project write is awaited
 * mid-run, and the user may type during it.
 */
export interface AutoMoveDoc {
	getText(): string;
	dispatch(changes: AutoMoveChanges): void;
}

/** What an update turned up: a move is due, and which line was ticked. */
export interface AutoMoveCandidate {
	/** Text of the line whose checkbox just became `[x]`, null if only started */
	completedLine: string | null;
}

export function createAutoMoveExtension(plugin: BulletFlowPlugin): Extension {
	// One run at a time per editor: a run awaits a project-note write, and two
	// overlapping runs would both see the same not-yet-filed task and write it
	// to the project note twice.
	const running = new WeakMap<EditorView, Promise<void>>();

	return EditorView.updateListener.of((update: ViewUpdate) => {
		if (!update.docChanged) return;
		if (update.transactions.some(tr => tr.annotation(autoMoveAnnotation))) return;

		const candidate = detectAutoMoveCandidate(
			update.changes,
			update.state.doc,
			update.startState.doc
		);
		if (!candidate) return;

		const view = update.view;
		setTimeout(() => {
			const previous = running.get(view) ?? Promise.resolve();
			const next = previous
				.then(() => performAutoMove(plugin, view, candidate))
				.catch((e: any) => {
					console.error('autoMoveCompleted error:', e);
				});
			running.set(view, next);
		}, 0);
	});
}

/**
 * Report whether any change in the update transitioned a task TO completed or
 * started, along with the text of the completed line.
 *
 * The line *number* is deliberately not carried over — it is found fresh later.
 * The text is, because a task ticked in the Log section can't be located any
 * other way: completed tasks pile up there, so nothing about the document
 * says which one the user just ticked.
 *
 * Takes the three pieces of a `ViewUpdate` it actually reads rather than the
 * update itself, so the transition rules can be exercised from a plain
 * `EditorState` transaction without standing up a CM6 view.
 */
export function detectAutoMoveCandidate(
	changes: ChangeSet,
	newDoc: Text,
	oldDoc: Text
): AutoMoveCandidate | null {
	const found = { any: false, completedLine: null as string | null };

	changes.iterChanges((_fromA, _toA, fromB, toB) => {
		if (found.completedLine !== null) return;
		const startLine = newDoc.lineAt(fromB).number;
		const endLine = newDoc.lineAt(Math.min(toB, newDoc.length)).number;

		for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
			const newLine = newDoc.line(lineNum);
			const newMarker = TaskMarker.fromLine(newLine.text);
			if (!newMarker || (newMarker.state !== TaskState.Completed && newMarker.state !== TaskState.Started)) continue;

			const oldPos = changes.mapPos(newLine.from, -1);
			if (oldPos >= 0 && oldPos <= oldDoc.length) {
				const oldLine = oldDoc.lineAt(oldPos);
				const oldMarker = TaskMarker.fromLine(oldLine.text);
				if (oldMarker && oldMarker.state === newMarker.state) continue;
			}

			found.any = true;
			if (newMarker.state === TaskState.Completed) {
				found.completedLine = newLine.text;
				return;
			}
		}
	});

	return found.any ? { completedLine: found.completedLine } : null;
}

/**
 * Bridge the captured CM6 view to a document-level auto-move run.
 */
async function performAutoMove(
	plugin: BulletFlowPlugin,
	view: EditorView,
	candidate: AutoMoveCandidate
): Promise<void> {
	// Resolve the file from the captured editor view itself — the *active*
	// view may have changed between the edit and this deferred callback,
	// which would gate (or dispatch) against the wrong document.
	const file = view.state.field(editorInfoField, false)?.file;
	if (!file) return;

	await runAutoMove(plugin, file, {
		getText: () => view.state.doc.toString(),
		dispatch: (changes) => view.dispatch({ changes, annotations: autoMoveAnnotation.of(true) })
	}, candidate.completedLine);
}

/**
 * File what the user just ticked, in whichever section it sits.
 *
 * @param completedLine - Text of the just-ticked line, when the update
 *   completed a task; only the Log pass needs it (see `detectAutoMoveCandidate`)
 */
export async function runAutoMove(
	plugin: BulletFlowPlugin,
	file: TFile,
	doc: AutoMoveDoc,
	completedLine: string | null = null
): Promise<void> {
	const noteService = new PeriodicNoteService(getPeriodicConfig());
	const noteInfo = noteService.parseNoteType(file.basename);
	if (!noteInfo || noteInfo.type !== 'daily') return;

	const todoHeading = plugin.settings.periodicNoteTaskTargetHeading;
	const logHeading = plugin.settings.dailyNoteLogHeading;

	const movedFromTodo = await moveTodoTrigger(plugin, file, doc, todoHeading, logHeading);

	// A task ticked where it already sits in the Log has nothing to move, but
	// still belongs in its project's log. Skipped when the Todo pass just filed
	// that same line — it is only in the Log section because it was moved there.
	if (completedLine !== null && completedLine !== movedFromTodo) {
		await completeLogTrigger(plugin, file, doc, logHeading, completedLine);
	}
}

/**
 * Scan the document fresh for the first completed/started task in the Todo
 * section and file it under Log — completing it in its project note first when
 * it is a project task.
 *
 * @returns The text of the line filed under Log, or null if nothing moved
 */
async function moveTodoTrigger(
	plugin: BulletFlowPlugin,
	file: TFile,
	doc: AutoMoveDoc,
	todoHeading: string,
	logHeading: string
): Promise<string | null> {
	let docText = doc.getText();
	let triggerLine = findAutoMoveTriggerLine(docText, todoHeading);
	if (triggerLine === null) return null;

	const triggerText = docText.split('\n')[triggerLine];
	let moveLineOnly = false;
	const { outcome } = await completeTriggerInProject(plugin, file, docText, triggerLine, todoHeading);

	if (outcome === 'failed') return null; // target write failed — leave the source alone
	if (outcome === 'completed') {
		moveLineOnly = true;

		// The project write was awaited; the user may have typed meanwhile.
		// Re-locate the trigger and bail if it is no longer the same line —
		// filing a different task line-only would drop its children.
		const freshText = doc.getText();
		if (freshText !== docText) {
			const freshTrigger = findAutoMoveTriggerLine(freshText, todoHeading);
			if (freshTrigger === null) return null;
			if (freshText.split('\n')[freshTrigger] !== triggerText) return null;
			docText = freshText;
			triggerLine = freshTrigger;
		}
	}

	const result = computeAutoMove(docText, triggerLine, todoHeading, logHeading, { moveLineOnly });
	if (!result) return null;

	doc.dispatch(result.changes);
	return triggerText;
}

/**
 * File a project task ticked where it already sits in the Log section. Nothing
 * moves — the line stays where the user wrote it — but its notes travel to the
 * project log like on every other path, so the project note holds the detail.
 */
async function completeLogTrigger(
	plugin: BulletFlowPlugin,
	file: TFile,
	doc: AutoMoveDoc,
	logHeading: string,
	completedLine: string
): Promise<void> {
	const docText = doc.getText();
	const triggerLine = findCompletedTaskLineByText(docText, logHeading, completedLine);
	if (triggerLine === null) return;

	const { outcome, children } = await completeTriggerInProject(plugin, file, docText, triggerLine, logHeading);
	if (outcome !== 'completed' || !children) return;

	// Same async gap as the Todo pass: re-locate the line and delete only the
	// children that were actually filed, so notes typed during the write stay.
	const freshText = doc.getText();
	const freshLine = findCompletedTaskLineByText(freshText, logHeading, completedLine);
	if (freshLine === null) return;

	const freshBlock = findAutoMoveBlock(freshText, freshLine, logHeading);
	if (!freshBlock || freshBlock.rootLine !== freshLine) return;

	const filed = docText.split('\n').slice(children.start, children.end).join('\n');
	const current = freshText.split('\n').slice(freshLine + 1, freshBlock.endLine).join('\n');
	if (current !== filed) return;

	const removal = computeLineRangeRemoval(freshText, freshLine + 1, freshBlock.endLine);
	if (removal) doc.dispatch(removal.changes);
}

/**
 * Complete the trigger task in its project note when it qualifies: it must be
 * genuinely completed (a started `[/]` task isn't done) and be the root of its
 * block — a task nested under something else is not the one the project note
 * knows about. Its children travel to the project log.
 *
 * @param sectionHeading - The section the trigger sits in (Todo or Log)
 * @returns The outcome, plus the source range of the children now filed
 */
async function completeTriggerInProject(
	plugin: BulletFlowPlugin,
	file: TFile,
	docText: string,
	triggerLine: number,
	sectionHeading: string
): Promise<{ outcome: AutoCompletionOutcome; children: { start: number; end: number } | null }> {
	const lines = docText.split('\n');
	if (TaskMarker.fromLine(lines[triggerLine])?.state !== TaskState.Completed) {
		return { outcome: 'skipped', children: null };
	}

	const block = findAutoMoveBlock(docText, triggerLine, sectionHeading);
	if (!block || block.rootLine !== triggerLine) return { outcome: 'skipped', children: null };

	const children = { start: triggerLine + 1, end: block.endLine };
	const childLines = lines.slice(children.start, children.end);
	const outcome = await completeProjectTaskAtLine(plugin, file, docText, triggerLine, childLines);
	return { outcome, children };
}
