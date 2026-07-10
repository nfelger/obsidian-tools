import { describe, it, expect } from 'vitest';
import { formatTransferNotice } from '../../src/utils/notices';

describe('formatTransferNotice', () => {
	it('reports a single new task', () => {
		const message = formatTransferNotice('Push task down', 'pushed', 'lower note', 1, 0, 1);
		expect(message).toBe('Push task down: Task pushed to lower note.');
	});

	it('reports a single merged task', () => {
		const message = formatTransferNotice('Push task down', 'pushed', 'lower note', 1, 1, 0);
		expect(message).toBe('Push task down: Task merged with existing in lower note.');
	});

	it('reports multiple tasks with a new/merged breakdown', () => {
		const message = formatTransferNotice('Pull task up', 'pulled', 'higher note', 3, 1, 2);
		expect(message).toBe('Pull task up: 3 tasks pulled to higher note (2 new, 1 merged).');
	});

	it('omits the new count when everything merged', () => {
		const message = formatTransferNotice('Take project task', 'taken', 'daily note', 2, 2, 0);
		expect(message).toBe('Take project task: 2 tasks taken to daily note (2 merged).');
	});

	it('omits the merged count when everything is new', () => {
		const message = formatTransferNotice('Take project task', 'taken', 'daily note', 2, 0, 2);
		expect(message).toBe('Take project task: 2 tasks taken to daily note (2 new).');
	});
});
