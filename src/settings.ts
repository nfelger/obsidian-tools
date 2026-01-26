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
			.setName('Target section heading')
			.setDesc('Heading for the target section when extracting/migrating (include # symbols)')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.targetSectionHeading)
				.setValue(this.plugin.settings.targetSectionHeading)
				.onChange(async (value) => {
					this.plugin.settings.targetSectionHeading = value;
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
