import { Plugin, Notice } from 'obsidian';
import { extractLog } from './commands/extractLog';
import { migrateTask } from './commands/migrateTask';

export default class BulletFlowPlugin extends Plugin {
	async onload() {
		console.log('Loading Bullet Flow plugin');

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

		// Test command (keep for now)
		this.addCommand({
			id: 'test-command',
			name: 'Test - Plugin is working!',
			callback: () => {
				new Notice('🚀 Build #8 - Walking skeleton COMPLETE! 🚀');
			}
		});
	}

	onunload() {
		console.log('Unloading Bullet Flow plugin');
	}
}
