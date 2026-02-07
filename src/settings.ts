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

		new Setting(containerEl)
			.setName('Diary folder')
			.setDesc('Base folder for periodic notes')
			.addText(text => {
				text
					.setPlaceholder(DEFAULT_SETTINGS.diaryFolder)
					.setValue(this.plugin.settings.diaryFolder)
					.onChange(async (value) => {
						this.plugin.settings.diaryFolder = value;
						await this.plugin.saveSettings();
					});
				// Add folder suggestions
				new FolderSuggest(this.app, text.inputEl);
			});

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

		// === Periodic Note Patterns ===
		containerEl.createEl('h2', { text: 'Periodic Note Patterns' });

		const patternDesc = containerEl.createEl('p');
		patternDesc.appendText('Path patterns use ');
		const link = patternDesc.createEl('a', {
			text: 'moment.js format tokens',
			href: 'https://momentjs.com/docs/#/displaying/format/'
		});
		link.setAttr('target', '_blank');
		patternDesc.appendText('. Common tokens: ');
		patternDesc.createEl('code', { text: 'YYYY' });
		patternDesc.appendText(' (year), ');
		patternDesc.createEl('code', { text: 'MM' });
		patternDesc.appendText(' (month), ');
		patternDesc.createEl('code', { text: 'DD' });
		patternDesc.appendText(' (day), ');
		patternDesc.createEl('code', { text: 'ddd' });
		patternDesc.appendText(' (weekday), ');
		patternDesc.createEl('code', { text: 'WW' });
		patternDesc.appendText(' (ISO week), ');
		patternDesc.createEl('code', { text: 'gggg' });
		patternDesc.appendText(' (ISO week year)');

		new Setting(containerEl)
			.setName('Daily note pattern')
			.setDesc('Path pattern relative to diary folder')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.dailyNotePattern)
				.setValue(this.plugin.settings.dailyNotePattern)
				.onChange(async (value) => {
					this.plugin.settings.dailyNotePattern = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Weekly note pattern')
			.setDesc('Path pattern relative to diary folder')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.weeklyNotePattern)
				.setValue(this.plugin.settings.weeklyNotePattern)
				.onChange(async (value) => {
					this.plugin.settings.weeklyNotePattern = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Monthly note pattern')
			.setDesc('Path pattern relative to diary folder')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.monthlyNotePattern)
				.setValue(this.plugin.settings.monthlyNotePattern)
				.onChange(async (value) => {
					this.plugin.settings.monthlyNotePattern = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Yearly note pattern')
			.setDesc('Path pattern relative to diary folder')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.yearlyNotePattern)
				.setValue(this.plugin.settings.yearlyNotePattern)
				.onChange(async (value) => {
					this.plugin.settings.yearlyNotePattern = value;
					await this.plugin.saveSettings();
				}));
	}
}
