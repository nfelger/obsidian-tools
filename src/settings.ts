import { App, PluginSettingTab, Setting } from 'obsidian';
import type BulletFlowPlugin from './main';
import { DEFAULT_SETTINGS } from './types';

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
			.setDesc('Base folder for periodic notes (without leading or trailing slashes)')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.diaryFolder)
				.setValue(this.plugin.settings.diaryFolder)
				.onChange(async (value) => {
					this.plugin.settings.diaryFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Log section heading')
			.setDesc('Heading for the log section (include # symbols, e.g., "## Log" or "### Inbox")')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.logSectionHeading)
				.setValue(this.plugin.settings.logSectionHeading)
				.onChange(async (value) => {
					this.plugin.settings.logSectionHeading = value;
					await this.plugin.saveSettings();
				}));

		// === Periodic Note Patterns ===
		containerEl.createEl('h2', { text: 'Periodic Note Patterns' });

		const patternDesc = containerEl.createEl('p', {
			text: 'Define path patterns for each note type. Available tokens: '
		});
		patternDesc.createEl('code', { text: '{year}' });
		patternDesc.appendText(' (4-digit), ');
		patternDesc.createEl('code', { text: '{month}' });
		patternDesc.appendText(' (2-digit), ');
		patternDesc.createEl('code', { text: '{day}' });
		patternDesc.appendText(' (2-digit), ');
		patternDesc.createEl('code', { text: '{weekday}' });
		patternDesc.appendText(' (Mon-Sun), ');
		patternDesc.createEl('code', { text: '{monthName}' });
		patternDesc.appendText(' (Jan-Dec), ');
		patternDesc.createEl('code', { text: '{week}' });
		patternDesc.appendText(' (2-digit ISO week)');

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
