/**
 * CM6 extension that auto-moves completed and started tasks from ## Todo to ## Log in daily notes.
 */

import { EditorView, ViewUpdate } from '@codemirror/view';
import { Annotation, Extension } from '@codemirror/state';
import { MarkdownView } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { PeriodicNoteService } from '../utils/periodicNotes';
import { TaskMarker, TaskState } from '../utils/tasks';
import { computeAutoMove } from '../utils/autoMove';

/**
 * Annotation used to mark our programmatic transactions.
 * The update listener skips any update that contains this annotation,
 * preventing re-entrancy when the move itself changes the document.
 */
const autoMoveAnnotation = Annotation.define<boolean>();

/**
 * Create a CM6 extension that watches for task completions/starts and moves them to Log.
 */
export function createAutoMoveExtension(plugin: BulletFlowPlugin): Extension {
	return EditorView.updateListener.of((update: ViewUpdate) => {
		if (!update.docChanged) return;

		// Skip our own programmatic transactions
		if (update.transactions.some(tr => tr.annotation(autoMoveAnnotation))) return;

		// Check if any change created a new [x] or [/] task
		const triggerLine = detectAutoMoveTrigger(update);
		if (triggerLine === null) return;

		// Schedule the move asynchronously to avoid recursive dispatch
		const view = update.view;
		setTimeout(() => {
			try {
				performAutoMove(plugin, view, triggerLine);
			} catch (e: any) {
				console.error('autoMoveCompleted error:', e);
			}
		}, 0);
	});
}

/**
 * Detect if a change in the update created a new [x] or [/] task.
 * Returns the line number (0-indexed) in the new document, or null.
 */
function detectAutoMoveTrigger(update: ViewUpdate): number | null {
	const newDoc = update.state.doc;
	const oldDoc = update.startState.doc;

	let foundLine: number | null = null;

	update.changes.iterChanges((_fromA, _toA, fromB, toB) => {
		if (foundLine !== null) return;

		// Find the range of lines affected in the new document
		const startLine = newDoc.lineAt(fromB).number;
		const endLine = newDoc.lineAt(Math.min(toB, newDoc.length)).number;

		for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
			const newLine = newDoc.line(lineNum);
			const newMarker = TaskMarker.fromLine(newLine.text);
			if (!newMarker || (newMarker.state !== TaskState.Completed && newMarker.state !== TaskState.Started)) continue;

			// Check if this line already had the same state in the old document
			const oldPos = update.changes.mapPos(newLine.from, -1);
			if (oldPos >= 0 && oldPos <= oldDoc.length) {
				const oldLine = oldDoc.lineAt(oldPos);
				const oldMarker = TaskMarker.fromLine(oldLine.text);
				if (oldMarker && oldMarker.state === newMarker.state) {
					// Same state before — not a new trigger
					continue;
				}
			}

			foundLine = lineNum - 1; // Convert from 1-indexed CM6 to 0-indexed
			return;
		}
	});

	return foundLine;
}

/**
 * Perform the actual auto-move if conditions are met.
 */
function performAutoMove(
	plugin: BulletFlowPlugin,
	view: EditorView,
	triggerLine: number
): void {
	// Verify we're in a daily note
	const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!markdownView?.file) return;

	const noteService = new PeriodicNoteService(plugin.settings);
	const noteInfo = noteService.parseNoteType(markdownView.file.basename);
	if (!noteInfo || noteInfo.type !== 'daily') return;

	// Re-read the document (state may have changed since detection)
	const docText = view.state.doc.toString();
	const todoHeading = plugin.settings.periodicNoteTaskTargetHeading;
	const logHeading = plugin.settings.dailyNoteLogHeading;

	// Verify the line is still a completed or started task
	const lines = docText.split('\n');
	if (triggerLine < 0 || triggerLine >= lines.length) return;
	const marker = TaskMarker.fromLine(lines[triggerLine]);
	if (!marker || (marker.state !== TaskState.Completed && marker.state !== TaskState.Started)) return;

	const result = computeAutoMove(docText, triggerLine, todoHeading, logHeading);
	if (!result) return;

	// Dispatch the move as a single transaction with our annotation
	view.dispatch({
		changes: result.changes,
		annotations: autoMoveAnnotation.of(true)
	});
}
