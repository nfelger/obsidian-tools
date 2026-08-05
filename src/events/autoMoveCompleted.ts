/**
 * CM6 extension that auto-moves completed and started tasks from ## Todo to ## Log in daily notes.
 *
 * Design: detectAutoMoveCandidate checks if any change might have completed/started a task.
 * If so, schedules runAutoMove via setTimeout(0) to run after CM6 finishes its transaction.
 * runAutoMove re-scans the document fresh — it does NOT use the line captured at detection
 * time, avoiding the stale-reference bug where intervening edits shift line numbers.
 *
 * A ticked task carrying a [[Project]] prefix is completed in its project note
 * on the way, running the same logic as the Complete project task command
 * (see src/utils/projectCompletion.ts) so the loop closes without a keystroke.
 */

import { EditorView, ViewUpdate } from '@codemirror/view';
import { Annotation, Extension } from '@codemirror/state';
import { editorInfoField, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { PeriodicNoteService } from '../utils/periodicNotes';
import { getPeriodicConfig } from '../utils/periodicNoteCreator';
import { TaskMarker, TaskState } from '../utils/tasks';
import { computeAutoMove, findAutoMoveBlock, findAutoMoveTriggerLine } from '../utils/autoMove';
import { completeProjectTaskAtLine, type AutoCompletionOutcome } from '../utils/projectCompletion';

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

export function createAutoMoveExtension(plugin: BulletFlowPlugin): Extension {
	// One run at a time per editor: a run awaits a project-note write, and two
	// overlapping runs would both see the same not-yet-filed task and write it
	// to the project note twice.
	const running = new WeakMap<EditorView, Promise<void>>();

	return EditorView.updateListener.of((update: ViewUpdate) => {
		if (!update.docChanged) return;
		if (update.transactions.some(tr => tr.annotation(autoMoveAnnotation))) return;
		if (!detectAutoMoveCandidate(update)) return;

		const view = update.view;
		setTimeout(() => {
			const previous = running.get(view) ?? Promise.resolve();
			const next = previous
				.then(() => performAutoMove(plugin, view))
				.catch((e: any) => {
					console.error('autoMoveCompleted error:', e);
				});
			running.set(view, next);
		}, 0);
	});
}

/**
 * Returns true if any change in the update transitioned a task TO completed or started.
 * Only determines whether to schedule a move — the actual line is found fresh later.
 */
function detectAutoMoveCandidate(update: ViewUpdate): boolean {
	const newDoc = update.state.doc;
	const oldDoc = update.startState.doc;
	let found = false;

	update.changes.iterChanges((_fromA, _toA, fromB, toB) => {
		if (found) return;
		const startLine = newDoc.lineAt(fromB).number;
		const endLine = newDoc.lineAt(Math.min(toB, newDoc.length)).number;

		for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
			const newLine = newDoc.line(lineNum);
			const newMarker = TaskMarker.fromLine(newLine.text);
			if (!newMarker || (newMarker.state !== TaskState.Completed && newMarker.state !== TaskState.Started)) continue;

			const oldPos = update.changes.mapPos(newLine.from, -1);
			if (oldPos >= 0 && oldPos <= oldDoc.length) {
				const oldLine = oldDoc.lineAt(oldPos);
				const oldMarker = TaskMarker.fromLine(oldLine.text);
				if (oldMarker && oldMarker.state === newMarker.state) continue;
			}

			found = true;
			return;
		}
	});

	return found;
}

/**
 * Bridge the captured CM6 view to a document-level auto-move run.
 */
async function performAutoMove(plugin: BulletFlowPlugin, view: EditorView): Promise<void> {
	// Resolve the file from the captured editor view itself — the *active*
	// view may have changed between the edit and this deferred callback,
	// which would gate (or dispatch) against the wrong document.
	const file = view.state.field(editorInfoField, false)?.file;
	if (!file) return;

	await runAutoMove(plugin, file, {
		getText: () => view.state.doc.toString(),
		dispatch: (changes) => view.dispatch({ changes, annotations: autoMoveAnnotation.of(true) })
	});
}

/**
 * Scan the document fresh for the first completed/started task in the Todo
 * section and file it under Log — completing it in its project note first when
 * it is a project task.
 *
 * Project completion applies only when the ticked task is the whole block being
 * filed (its own root): a task nested under something else is not the task the
 * project note knows about, and the block that moves would not be it either.
 */
export async function runAutoMove(
	plugin: BulletFlowPlugin,
	file: TFile,
	doc: AutoMoveDoc
): Promise<void> {
	const noteService = new PeriodicNoteService(getPeriodicConfig());
	const noteInfo = noteService.parseNoteType(file.basename);
	if (!noteInfo || noteInfo.type !== 'daily') return;

	const todoHeading = plugin.settings.periodicNoteTaskTargetHeading;
	const logHeading = plugin.settings.dailyNoteLogHeading;

	let docText = doc.getText();
	let triggerLine = findAutoMoveTriggerLine(docText, todoHeading);
	if (triggerLine === null) return;

	let moveLineOnly = false;
	const completion = await completeTriggerInProject(plugin, file, docText, triggerLine, todoHeading);

	if (completion === 'failed') return; // target write failed — leave the source alone
	if (completion === 'completed') {
		moveLineOnly = true;

		// The project write was awaited; the user may have typed meanwhile.
		// Re-locate the trigger and bail if it is no longer the same line —
		// filing a different task line-only would drop its children.
		const triggerText = docText.split('\n')[triggerLine];
		const freshText = doc.getText();
		if (freshText !== docText) {
			const freshTrigger = findAutoMoveTriggerLine(freshText, todoHeading);
			if (freshTrigger === null) return;
			if (freshText.split('\n')[freshTrigger] !== triggerText) return;
			docText = freshText;
			triggerLine = freshTrigger;
		}
	}

	const result = computeAutoMove(docText, triggerLine, todoHeading, logHeading, { moveLineOnly });
	if (!result) return;

	doc.dispatch(result.changes);
}

/**
 * Complete the trigger task in its project note when it qualifies: it must be
 * genuinely completed (a started `[/]` task isn't done) and be the root of the
 * block that auto-move files. Its children travel to the project log.
 */
async function completeTriggerInProject(
	plugin: BulletFlowPlugin,
	file: TFile,
	docText: string,
	triggerLine: number,
	todoHeading: string
): Promise<AutoCompletionOutcome> {
	const lines = docText.split('\n');
	if (TaskMarker.fromLine(lines[triggerLine])?.state !== TaskState.Completed) return 'skipped';

	const block = findAutoMoveBlock(docText, triggerLine, todoHeading);
	if (!block || block.rootLine !== triggerLine) return 'skipped';

	const childLines = lines.slice(triggerLine + 1, block.endLine);
	return completeProjectTaskAtLine(plugin, file, docText, triggerLine, childLines);
}
