import { describe, it, expect } from 'vitest';
import { PeriodPickerModal } from '../../src/adapters/periodPicker';
import { createMockApp } from '../mocks/obsidian';
import type { PeriodicGranularity } from '../../src/types';

/** Open the picker the way `promptForPeriod` does, and wait on its answer. */
function openPicker(hints?: Partial<Record<PeriodicGranularity, string>>) {
	const modal = new PeriodPickerModal(createMockApp() as any, hints);
	return { modal, choice: modal.ask() };
}

function press(modal: PeriodPickerModal, key: string) {
	const handler = (modal.scope as any).keys.find((k: any) => k.key === key);
	handler?.callback({ preventDefault: () => {} } as unknown as KeyboardEvent);
}

/** Click the row for a period, through the listener the modal registered. */
function clickRow(modal: PeriodPickerModal, granularity: PeriodicGranularity) {
	const index = modal.getRows().findIndex(row => row.granularity === granularity);
	const list = (modal.contentEl.createDiv as any).mock.results.at(-1).value;
	const rowEl = list.createDiv.mock.results[index].value;
	rowEl.dispatchEvent({ type: 'click' });
}

describe('PeriodPickerModal', () => {
	it('offers every period, shortest first', () => {
		const { modal } = openPicker();

		expect(modal.getRows().map(row => row.granularity))
			.toEqual(['daily', 'weekly', 'monthly', 'yearly']);
		expect((modal.scope as any).keys.map((k: any) => k.key)).toEqual(['d', 'w', 'm', 'y']);
	});

	it('resolves with the granularity whose key was pressed', async () => {
		const cases: Array<[string, PeriodicGranularity]> = [
			['d', 'daily'],
			['w', 'weekly'],
			['m', 'monthly'],
			['y', 'yearly']
		];

		for (const [key, granularity] of cases) {
			const { modal, choice } = openPicker();
			press(modal, key);
			await expect(choice).resolves.toBe(granularity);
		}
	});

	it('closes itself once a period is picked', async () => {
		const { modal, choice } = openPicker();
		expect(modal.isOpen).toBe(true);

		press(modal, 'w');
		await choice;

		expect(modal.isOpen).toBe(false);
	});

	it('resolves with null when dismissed without a choice', async () => {
		const { modal, choice } = openPicker();
		modal.close();
		await expect(choice).resolves.toBeNull();
	});

	it('resolves with the period of a clicked row', async () => {
		const { modal, choice } = openPicker();
		clickRow(modal, 'monthly');
		await expect(choice).resolves.toBe('monthly');
	});

	it('shows the note each period would write to, where one is known', () => {
		const { modal } = openPicker({ weekly: '2026-01-W04', yearly: '2026' });

		expect(modal.getRows().map(row => row.hint)).toEqual(['', '2026-01-W04', '', '2026']);
	});
});
