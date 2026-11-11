import { describe, it, expect } from 'vitest';
import {
	computeSourceSchedule,
	extractCascadePayload,
	insertCompletedIntoLog,
	scheduleIntoNote
} from '../../src/utils/cascade';
import { insertTaskWithDedup } from '../../src/utils/tasks';

describe('cascade', () => {
	describe('extractCascadePayload', () => {
		it('collects the task and the children that travel with it', () => {
			const doc = [
				'## Todo',
				'',
				'- [x] Call Sam',
				'\t- Ask about pricing',
				'\t- [x] Send the invoice'
			].join('\n');

			const payload = extractCascadePayload(doc, 2)!;

			expect(payload.taskText).toBe('Call Sam');
			expect(payload.taskLine).toBe('- [x] Call Sam');
			expect(payload.children).toEqual(['\t- Ask about pricing']);
		});

		it('ignores a line that is not a completed task', () => {
			expect(extractCascadePayload('- [ ] Call Sam', 0)).toBeNull();
			expect(extractCascadePayload('just a note', 0)).toBeNull();
		});
	});

	describe('scheduleIntoNote', () => {
		it('files the task as scheduled under the task heading', () => {
			const payload = {
				taskText: 'Call Sam',
				taskLine: '- [x] Call Sam',
				children: []
			};

			const result = scheduleIntoNote('## Todo\n', payload, '## Todo');

			expect(result.content).toContain('- [<] Call Sam');
			expect(result.payload.taskLine).toBe('- [<] Call Sam');
		});

		it('merges with a copy the note already holds', () => {
			const payload = {
				taskText: 'Call Sam',
				taskLine: '- [x] Call Sam',
				children: ['\t- Ask about pricing']
			};
			const note = ['## Todo', '', '- [<] Call Sam', '\t- Confirm the time'].join('\n');

			const result = scheduleIntoNote(note, payload, '## Todo');

			expect(result.content.match(/Call Sam/g)?.length).toBe(1);
			expect(result.content).toContain('- [<] Call Sam');
			expect(result.content).toContain('Confirm the time');
			expect(result.content).toContain('Ask about pricing');
			// The merged task carries both sets of children down the chain
			expect(result.payload.children).toEqual([
				'\t- Confirm the time',
				'\t- Ask about pricing'
			]);
		});
	});

	describe('insertCompletedIntoLog', () => {
		it('files the task completed under the log heading', () => {
			const payload = {
				taskText: 'Call Sam',
				taskLine: '- [x] Call Sam',
				children: ['\t- Ask about pricing']
			};

			const content = insertCompletedIntoLog('## Log\n', payload, '## Log');

			expect(content).toContain('- [x] Call Sam');
			expect(content).toContain('\t- Ask about pricing');
		});

		it('creates the log heading when the note has none', () => {
			const payload = { taskText: 'Call Sam', taskLine: '- [x] Call Sam', children: [] };

			const content = insertCompletedIntoLog('', payload, '## Log');

			expect(content).toContain('## Log');
			expect(content).toContain('- [x] Call Sam');
		});

		it('files only the task line when the children belong elsewhere', () => {
			const payload = {
				taskText: 'Call Sam',
				taskLine: '- [x] Call Sam',
				children: ['\t- Ask about pricing']
			};

			const content = insertCompletedIntoLog('## Log\n', payload, '## Log', { withChildren: false });

			expect(content).toContain('- [x] Call Sam');
			expect(content).not.toContain('Ask about pricing');
		});
	});

	describe('insertTaskWithDedup', () => {
		it('inserts a task the note does not hold and reports where it landed', () => {
			const result = insertTaskWithDedup(
				'## Todo\n',
				{
					taskText: 'Call Sam',
					taskContent: '- [<] Call Sam',
					childrenContent: ''
				},
				'## Todo'
			);

			expect(result.merged).toBe(false);
			expect(result.content).toContain('- [<] Call Sam');
			expect(result.lineNumber).toBe(result.content.split('\n').findIndex((l) => l.includes('Call Sam')));
		});

		it('merges with a matching copy the note already holds', () => {
			const note = ['## Todo', '', '- [<] Call Sam', '\t- Confirm the time'].join('\n');

			const result = insertTaskWithDedup(
				note,
				{
					taskText: 'Call Sam',
					taskContent: '- [<] Call Sam',
					childrenContent: '\t- Ask about pricing'
				},
				'## Todo'
			);

			expect(result.merged).toBe(true);
			expect(result.content.match(/Call Sam/g)?.length).toBe(1);
			expect(result.content).toContain('Confirm the time');
			expect(result.content).toContain('Ask about pricing');
		});
	});

	describe('computeSourceSchedule', () => {
		it('marks the task scheduled and drops the children that travelled', () => {
			const doc = [
				'## Todo',
				'',
				'- [x] Call Sam',
				'\t- Ask about pricing',
				'\t- [x] Send the invoice'
			].join('\n');

			const change = computeSourceSchedule(doc, 2)!;

			expect(doc.slice(change.from, change.to)).toBe(
				'- [x] Call Sam\n\t- Ask about pricing\n\t- [x] Send the invoice'
			);
			expect(change.insert).toBe('- [<] Call Sam\n\t- [x] Send the invoice');
		});
	});
});
