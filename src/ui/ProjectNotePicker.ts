import { App, FuzzySuggestModal, TFile } from 'obsidian';
import type { BulletFlowSettings } from '../types';
import { isProjectNote } from '../utils/projects';

/**
 * Fuzzy-search modal for selecting a project note.
 *
 * Resolves with the chosen TFile, or null if the user dismisses the modal.
 */
export class ProjectNotePicker extends FuzzySuggestModal<TFile> {
	private settings: BulletFlowSettings;
	private resolvePromise: (value: TFile | null) => void;
	public promise: Promise<TFile | null>;
	private resolved = false;

	constructor(app: App, settings: BulletFlowSettings) {
		super(app);
		this.settings = settings;
		this.setPlaceholder('Select a project note...');
		this.emptyStateText = 'No project notes found';

		this.promise = new Promise<TFile | null>((resolve) => {
			this.resolvePromise = resolve;
		});

		this.open();
	}

	/**
	 * Show the picker and return the user's selection.
	 * Returns null if the user dismisses without choosing.
	 */
	static pick(app: App, settings: BulletFlowSettings): Promise<TFile | null> {
		return new ProjectNotePicker(app, settings).promise;
	}

	getItems(): TFile[] {
		return this.app.vault
			.getMarkdownFiles()
			.filter(f => isProjectNote(f.path, this.settings))
			.sort((a, b) => a.basename.localeCompare(b.basename));
	}

	getItemText(item: TFile): string {
		return item.basename;
	}

	onChooseItem(item: TFile): void {
		this.resolved = true;
		this.resolvePromise(item);
	}

	onClose(): void {
		super.onClose();
		if (!this.resolved) {
			this.resolvePromise(null);
		}
	}
}
