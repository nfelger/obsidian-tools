/**
 * CM6 extension that auto-moves completed and started tasks from ## Todo to ## Log in daily notes.
 *
 * Design: detectAutoMoveCandidate checks if any change might have completed/started a task.
 * If so, schedules performAutoMove via setTimeout(0) to run after CM6 finishes its transaction.
 * performAutoMove re-scans the document fresh — it does NOT use the line captured at detection
 * time, avoiding the stale-reference bug where intervening edits shift line numbers.
 */

import { EditorView, ViewUpdate } from '@codemirror/view';
import { Annotation, Extension } from '@codemirror/state';
import { editorInfoField } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { PeriodicNoteService } from '../utils/periodicNotes';
import { getPeriodicConfig } from '../utils/periodicNoteCreator';
import { TaskMarker, TaskState } from '../utils/tasks';
import { computeAutoMove, findAutoMoveTriggerLine } from '../utils/autoMove';

const autoMoveAnnotation = Annotation.define<boolean>();

export function createAutoMoveExtension(plugin: BulletFlowPlugin): Extension {
	return EditorView.updateListener.of((update: ViewUpdate) => {
		if (!update.docChanged) return;
		if (update.transactions.some(tr => tr.annotation(autoMoveAnnotation))) return;
		if (!detectAutoMoveCandidate(update)) return;

		const view = update.view;
		setTimeout(() => {
			try {
				performAutoMove(plugin, view);
			} catch (e: any) {
				console.error('autoMoveCompleted error:', e);
			}
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
 * Scan the current document fresh for the first completed/started task in the Todo section
 * and move it to Log. Called via setTimeout(0) to avoid CM6 re-entrancy.
 */
function performAutoMove(plugin: BulletFlowPlugin, view: EditorView): void {
	// Resolve the file from the captured editor view itself — the *active*
	// view may have changed between the edit and this deferred callback,
	// which would gate (or dispatch) against the wrong document.
	const file = view.state.field(editorInfoField, false)?.file;
	if (!file) return;

	const noteService = new PeriodicNoteService(getPeriodicConfig());
	const noteInfo = noteService.parseNoteType(file.basename);
	if (!noteInfo || noteInfo.type !== 'daily') return;

	const docText = view.state.doc.toString();
	const todoHeading = plugin.settings.periodicNoteTaskTargetHeading;
	const logHeading = plugin.settings.dailyNoteLogHeading;

	const triggerLine = findAutoMoveTriggerLine(docText, todoHeading);
	if (triggerLine === null) return;

	const result = computeAutoMove(docText, triggerLine, todoHeading, logHeading);
	if (!result) return;

	view.dispatch({
		changes: result.changes,
		annotations: autoMoveAnnotation.of(true)
	});
}
