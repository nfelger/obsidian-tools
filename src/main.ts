import { Plugin, TFile } from 'obsidian';
import { extractLog } from './commands/extractLog';
import { migrateTask } from './commands/migrateTask';
import { pushTaskDown } from './commands/pushTaskDown';
import { pullTaskUp } from './commands/pullTaskUp';
import { takeProjectTask } from './commands/takeProjectTask';
import { dropTaskToProject } from './commands/dropTaskToProject';
import { HotkeyModal } from './ui/HotkeyModal';
import { BulletFlowSettingTab } from './settings';
import type { BulletFlowSettings } from './types';
import { DEFAULT_SETTINGS } from './types';
import { PeriodicNoteService } from './utils/periodicNotes';
import { moveAllCompletedTodosToLog } from './utils/todoCompletionTracker';

export default class BulletFlowPlugin extends Plugin {
	settings: BulletFlowSettings;
	private isProcessingMove = false;

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

		// Auto-move completed tasks from ## Todo to ## Log in daily notes
		this.registerEvent(
			this.app.metadataCache.on('changed', (file: TFile) => {
				this.handleTodoCompletion(file);
			})
		);

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

		// Take Project Task command
		this.addCommand({
			id: 'take-project-task',
			name: 'Take project task to daily note',
			callback: () => takeProjectTask(this)
		});

		// Drop Task to Project command
		this.addCommand({
			id: 'drop-task-to-project',
			name: 'Drop task to project note',
			callback: () => dropTaskToProject(this)
		});

		// Hotkey Modal command (leader key)
		this.addCommand({
			id: 'hotkey-modal',
			name: 'Command menu',
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'b' }],
			callback: () => new HotkeyModal(this.app, this).open()
		});
	}

	private async handleTodoCompletion(file: TFile) {
		if (this.isProcessingMove) return;

		const noteService = new PeriodicNoteService(this.settings);
		const noteInfo = noteService.parseNoteType(file.basename);
		if (!noteInfo || noteInfo.type !== 'daily') return;

		this.isProcessingMove = true;
		try {
			await this.app.vault.process(file, (content) => {
				const result = moveAllCompletedTodosToLog(
					content,
					'## Todo',
					this.settings.periodicNoteTaskTargetHeading
				);
				return result ?? content;
			});
		} finally {
			this.isProcessingMove = false;
		}
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
