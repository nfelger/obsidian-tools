import { App, Modal } from 'obsidian';
import type { PeriodicGranularity } from '../types';
import { PERIOD_CHOICES } from '../config';

/**
 * One offered period: the key that picks it and, when known, the note it
 * would write to (shown so the user can see where a task is headed).
 */
interface PeriodRow {
	key: string;
	label: string;
	granularity: PeriodicGranularity;
	hint: string;
}

/**
 * Asks which periodic note a task should go to — day, week, month or year.
 *
 * The answer arrives through `ask()`, which resolves once the user picks a
 * period or dismisses the modal (Escape or clicking away), so a command can
 * await it and bail out on a dismissal without having written anything.
 */
export class PeriodPickerModal extends Modal {
	private readonly rows: PeriodRow[];
	private picked: PeriodicGranularity | null = null;
	private settle: ((granularity: PeriodicGranularity | null) => void) | null = null;

	constructor(app: App, hints: Partial<Record<PeriodicGranularity, string>> = {}) {
		super(app);
		this.rows = PERIOD_CHOICES.map(({ key, label, granularity }) => ({
			key,
			label,
			granularity,
			hint: hints[granularity] ?? ''
		}));
	}

	/**
	 * Open the picker and resolve with the chosen period, or null if the user
	 * dismissed it.
	 */
	ask(): Promise<PeriodicGranularity | null> {
		return new Promise(resolve => {
			this.settle = resolve;
			this.open();
		});
	}

	onOpen() {
		this.renderContent();
		this.registerKeyHandlers();
	}

	onClose() {
		this.contentEl.empty();
		const settle = this.settle;
		this.settle = null;
		settle?.(this.picked);
	}

	private renderContent() {
		const { contentEl } = this;
		contentEl.addClass('bullet-flow-period-picker');
		contentEl.createDiv({ cls: 'period-title', text: 'Take to…' });

		const container = contentEl.createDiv({ cls: 'period-list' });
		for (const row of this.rows) {
			const rowEl = container.createDiv({
				cls: 'period-row',
				attr: { 'data-period': row.granularity }
			});
			rowEl.createSpan({ cls: 'period-key', text: row.key });
			rowEl.createSpan({ cls: 'period-label', text: row.label });
			if (row.hint) rowEl.createSpan({ cls: 'period-hint', text: row.hint });
			rowEl.addEventListener('click', () => this.pick(row.granularity));
		}
	}

	private registerKeyHandlers() {
		for (const row of this.rows) {
			this.scope.register([], row.key, (evt: KeyboardEvent) => {
				evt.preventDefault();
				this.pick(row.granularity);
				return false;
			});
		}
	}

	private pick(granularity: PeriodicGranularity) {
		this.picked = granularity;
		this.close();
	}

	/**
	 * Get the offered rows for testing purposes
	 * @internal
	 */
	getRows(): PeriodRow[] {
		return this.rows;
	}
}

/**
 * Ask the user which periodic note to write to.
 *
 * @param hints - Target note name per period, shown beside its label
 * @returns The chosen granularity, or null if the user dismissed the picker
 */
export function promptForPeriod(
	app: App,
	hints: Partial<Record<PeriodicGranularity, string>> = {}
): Promise<PeriodicGranularity | null> {
	return new PeriodPickerModal(app, hints).ask();
}
