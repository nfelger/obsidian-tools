import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { detectAutoMoveCandidate } from '../../src/events/autoMoveCompleted';

/**
 * Apply a change to a document and ask what the auto-move detector made of it.
 *
 * A real EditorState transaction is used rather than a hand-built stub, so the
 * ChangeSet position mapping the detector relies on behaves as it does in the
 * editor.
 */
function detect(doc: string, changes: Array<{ from: number; to?: number; insert: string }>) {
	const state = EditorState.create({ doc });
	const tr = state.update({ changes });
	return detectAutoMoveCandidate(tr.changes, tr.state.doc, tr.startState.doc);
}

/** Offset of the character inside a task line's `[ ]` marker. */
function markerOffset(doc: string, lineText: string): number {
	const lineStart = doc.indexOf(lineText);
	if (lineStart < 0) throw new Error(`line not found in doc: ${lineText}`);
	return lineStart + lineText.indexOf('[') + 1;
}

/** Retype the marker character of an existing task line. */
function retypeMarker(doc: string, lineText: string, marker: string) {
	const at = markerOffset(doc, lineText);
	return detect(doc, [{ from: at, to: at + 1, insert: marker }]);
}

const DOC = `
## Todo

- [ ] Water the plants
- [/] Call the dentist
- [x] Book the flights
- [>] Renew the passport
- a plain note bullet

## Log

- stood up late
`;

describe('detectAutoMoveCandidate', () => {
	describe('transitions that trigger a move', () => {
		it('reports the line text when a task is ticked complete', () => {
			const result = retypeMarker(DOC, '- [ ] Water the plants', 'x');

			expect(result).toEqual({ completedLine: '- [x] Water the plants' });
		});

		it('reports a move with no line text when a task is only started', () => {
			const result = retypeMarker(DOC, '- [ ] Water the plants', '/');

			expect(result).toEqual({ completedLine: null });
		});

		it('reports a started task that is then completed', () => {
			const result = retypeMarker(DOC, '- [/] Call the dentist', 'x');

			expect(result).toEqual({ completedLine: '- [x] Call the dentist' });
		});

		it('keeps the indentation of a nested task in the reported text', () => {
			const doc = `
## Todo

- [ ] Water the plants
	- [ ] repot the big one
`;
			const result = retypeMarker(doc, '\t- [ ] repot the big one', 'x');

			expect(result).toEqual({ completedLine: '\t- [x] repot the big one' });
		});

		it('detects a completed task pasted in as a new line', () => {
			const doc = `
## Todo

- [ ] Water the plants
`;
			const result = detect(doc, [{ from: doc.length, insert: '- [x] Book the flights\n' }]);

			expect(result).toEqual({ completedLine: '- [x] Book the flights' });
		});
	});

	describe('changes that trigger nothing', () => {
		it('ignores edits to a task that was already complete', () => {
			const at = DOC.indexOf('- [x] Book the flights') + '- [x] Book the flights'.length;
			const result = detect(DOC, [{ from: at, insert: ' today' }]);

			expect(result).toBeNull();
		});

		it('ignores edits to a task that was already started', () => {
			const at = DOC.indexOf('- [/] Call the dentist') + '- [/] Call the dentist'.length;
			const result = detect(DOC, [{ from: at, insert: ' again' }]);

			expect(result).toBeNull();
		});

		it('ignores a task marked migrated', () => {
			const result = retypeMarker(DOC, '- [ ] Water the plants', '>');

			expect(result).toBeNull();
		});

		it('ignores a task marked scheduled', () => {
			const result = retypeMarker(DOC, '- [ ] Water the plants', '<');

			expect(result).toBeNull();
		});

		it('ignores a task being un-ticked back to open', () => {
			const result = retypeMarker(DOC, '- [x] Book the flights', ' ');

			expect(result).toBeNull();
		});

		it('ignores edits to a plain note bullet', () => {
			const at = DOC.indexOf('- a plain note bullet') + '- a plain note bullet'.length;
			const result = detect(DOC, [{ from: at, insert: ' with more detail' }]);

			expect(result).toBeNull();
		});

		it('ignores typing on a heading', () => {
			const at = DOC.indexOf('## Todo') + '## Todo'.length;
			const result = detect(DOC, [{ from: at, insert: 'x' }]);

			expect(result).toBeNull();
		});
	});

	describe('multiple changes in one transaction', () => {
		it('reports the completed task when a change set also touches plain text', () => {
			const noteAt = DOC.indexOf('- a plain note bullet');
			const tickAt = markerOffset(DOC, '- [ ] Water the plants');
			const result = detect(DOC, [
				{ from: tickAt, to: tickAt + 1, insert: 'x' },
				{ from: noteAt + '- a plain note bullet'.length, insert: '!' }
			]);

			expect(result).toEqual({ completedLine: '- [x] Water the plants' });
		});

		it('reports the first completed task when two are ticked at once', () => {
			const doc = `
- [ ] Water the plants
- [ ] Call the dentist
`;
			const first = markerOffset(doc, '- [ ] Water the plants');
			const second = markerOffset(doc, '- [ ] Call the dentist');
			const result = detect(doc, [
				{ from: first, to: first + 1, insert: 'x' },
				{ from: second, to: second + 1, insert: 'x' }
			]);

			expect(result).toEqual({ completedLine: '- [x] Water the plants' });
		});

		it('prefers a completed task over a started one ticked in the same change', () => {
			const doc = `
- [ ] Water the plants
- [ ] Call the dentist
`;
			const started = markerOffset(doc, '- [ ] Water the plants');
			const completed = markerOffset(doc, '- [ ] Call the dentist');
			const result = detect(doc, [
				{ from: started, to: started + 1, insert: '/' },
				{ from: completed, to: completed + 1, insert: 'x' }
			]);

			expect(result).toEqual({ completedLine: '- [x] Call the dentist' });
		});
	});

	describe('document boundaries', () => {
		it('handles a task completed on the last line with no trailing newline', () => {
			const doc = `## Todo\n- [ ] Water the plants`;
			const result = retypeMarker(doc, '- [ ] Water the plants', 'x');

			expect(result).toEqual({ completedLine: '- [x] Water the plants' });
		});

		it('handles a completed task inserted at the very end of the document', () => {
			const doc = `## Todo\n`;
			const result = detect(doc, [{ from: doc.length, insert: '- [x] Water the plants' }]);

			expect(result).toEqual({ completedLine: '- [x] Water the plants' });
		});

		it('returns null for an empty document that gains a plain line', () => {
			const result = detect('', [{ from: 0, insert: 'just typing' }]);

			expect(result).toBeNull();
		});
	});
});
