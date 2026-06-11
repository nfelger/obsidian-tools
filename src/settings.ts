import { App, PluginSettingTab, Setting, TFolder, AbstractInputSuggest } from 'obsidian';
import type BulletFlowPlugin from './main';
import { DEFAULT_SETTINGS } from './types';

/**
 * Folder suggestion input for settings.
 */
class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private textInputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.textInputEl = inputEl;
	}

	getSuggestions(inputStr: string): TFolder[] {
		const folders: TFolder[] = [];
		const lowerInput = inputStr.toLowerCase();

		const rootFolder = this.app.vault.getRoot();
		this.collectFolders(rootFolder, folders, lowerInput);

		return folders.slice(0, 20); // Limit suggestions
	}

	private collectFolders(folder: TFolder, results: TFolder[], filter: string): void {
		if (folder.path && folder.path.toLowerCase().includes(filter)) {
			results.push(folder);
		}
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				this.collectFolders(child, results, filter);
			}
		}
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path || '/');
	}

	selectSuggestion(folder: TFolder): void {
		this.textInputEl.value = folder.path;
		this.textInputEl.trigger('input');
		this.close();
	}
}

export class BulletFlowSettingTab extends PluginSettingTab {
	plugin: BulletFlowPlugin;

	constructor(app: App, plugin: BulletFlowPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// === General Settings ===
		containerEl.createEl('h2', { text: 'General' });

		const locationsDesc = containerEl.createEl('p');
		locationsDesc.appendText(
			'Periodic note locations (folder and filename format) are read from the ' +
			'Daily Notes and Periodic Notes plugins — configure them there.'
		);

		new Setting(containerEl)
			.setName('Daily note log heading')
			.setDesc('Heading in daily notes where completed tasks are moved to')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.dailyNoteLogHeading)
				.setValue(this.plugin.settings.dailyNoteLogHeading)
				.onChange(async (value) => {
					this.plugin.settings.dailyNoteLogHeading = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Periodic note task heading')
			.setDesc('Heading in periodic notes where tasks are inserted (include # symbols)')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.periodicNoteTaskTargetHeading)
				.setValue(this.plugin.settings.periodicNoteTaskTargetHeading)
				.onChange(async (value) => {
					this.plugin.settings.periodicNoteTaskTargetHeading = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Log extraction heading')
			.setDesc('Heading where Extract Log places entries in target notes (include # symbols)')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.logExtractionTargetHeading)
				.setValue(this.plugin.settings.logExtractionTargetHeading)
				.onChange(async (value) => {
					this.plugin.settings.logExtractionTargetHeading = value;
					await this.plugin.saveSettings();
				}));

		// === Project Settings ===
		containerEl.createEl('h2', { text: 'Projects' });

		new Setting(containerEl)
			.setName('Projects folder')
			.setDesc('Folder containing project notes')
			.addText(text => {
				text
					.setPlaceholder(DEFAULT_SETTINGS.projectsFolder)
					.setValue(this.plugin.settings.projectsFolder)
					.onChange(async (value) => {
						this.plugin.settings.projectsFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(containerEl)
			.setName('Project note task heading')
			.setDesc('Heading in project notes where tasks live (include # symbols)')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.projectNoteTaskTargetHeading)
				.setValue(this.plugin.settings.projectNoteTaskTargetHeading)
				.onChange(async (value) => {
					this.plugin.settings.projectNoteTaskTargetHeading = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Project keywords')
			.setDesc('Keywords for collector tasks in daily notes (comma-separated, quote-enclosed)')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.projectKeywords)
				.setValue(this.plugin.settings.projectKeywords)
				.onChange(async (value) => {
					this.plugin.settings.projectKeywords = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Project archive folder')
			.setDesc('Folder where finished projects are moved to')
			.addText(text => {
				text
					.setPlaceholder(DEFAULT_SETTINGS.projectArchiveFolder)
					.setValue(this.plugin.settings.projectArchiveFolder)
					.onChange(async (value) => {
						this.plugin.settings.projectArchiveFolder = value;
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});
	}
}
