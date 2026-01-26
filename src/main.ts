import { Plugin } from 'obsidian';
import { extractLog } from './commands/extractLog';
import { migrateTask } from './commands/migrateTask';
import { CUSTOM_CHECKBOX_CSS } from './config';
import { BulletFlowSettingTab } from './settings';
import type { BulletFlowSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

export default class BulletFlowPlugin extends Plugin {
	settings: BulletFlowSettings;
	private styleEl?: HTMLStyleElement;

	async onload() {
		console.log('Loading Bullet Flow plugin');

		// Load settings
		await this.loadSettings();

		// Register settings tab
		this.addSettingTab(new BulletFlowSettingTab(this.app, this));

		// Inject custom checkbox CSS
		this.injectCustomCSS();

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

		// Remove custom CSS
		if (this.styleEl) {
			this.styleEl.remove();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private injectCustomCSS() {
		// Create style element
		this.styleEl = document.createElement('style');
		this.styleEl.id = 'bullet-flow-custom-checkboxes';
		this.styleEl.textContent = CUSTOM_CHECKBOX_CSS;

		// Add to document head
		document.head.appendChild(this.styleEl);
	}
}
