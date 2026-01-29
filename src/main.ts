import { Plugin } from 'obsidian';
import { extractLog } from './commands/extractLog';
import { migrateTask } from './commands/migrateTask';
import { pushTaskDown } from './commands/pushTaskDown';
import { pullTaskUp } from './commands/pullTaskUp';
import { HotkeyModal } from './ui/HotkeyModal';
import { BulletFlowSettingTab } from './settings';
import type { BulletFlowSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

export default class BulletFlowPlugin extends Plugin {
	settings: BulletFlowSettings;

	/**
	 * Get today's date. Exposed as method for testability.
	 */
	getToday(): Date {
		return new Date();
	}

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

		// Push Task Down command
		this.addCommand({
			id: 'push-task-down',
			name: 'Push task down to lower periodic note',
			callback: () => pushTaskDown(this)
		});

		// Pull Task Up command
		this.addCommand({
			id: 'pull-task-up',
			name: 'Pull task up to higher periodic note',
			callback: () => pullTaskUp(this)
		});

		// Hotkey Modal command (leader key)
		this.addCommand({
			id: 'hotkey-modal',
			name: 'Command menu',
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'b' }],
			callback: () => new HotkeyModal(this.app, this).open()
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
