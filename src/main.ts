import { Plugin } from 'obsidian';
import { extractLog } from './commands/extractLog';
import { migrateTask } from './commands/migrateTask';
import { BulletFlowSettingTab } from './settings';
import type { BulletFlowSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

export default class BulletFlowPlugin extends Plugin {
	settings: BulletFlowSettings;

	async onload() {
		console.log('Loading Bullet Flow plugin');

		// Load settings
		await this.loadSettings();

		// Register settings tab
		this.addSettingTab(new BulletFlowSettingTab(this.app, this));

		// Extract Log command
		this.addCommand({
			id: 'extract-log',
			name: 'Extract log to linked note',
			callback: () => extractLog(this)
		});

		// Migrate Task command
		this.addCommand({
			id: 'migrate-task',
			name: 'Migrate task to next note',
			callback: () => migrateTask(this)
		});
	}

	onunload() {
		console.log('Unloading Bullet Flow plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
