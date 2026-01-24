import { Plugin, Notice } from 'obsidian';

export default class ObsidianToolsPlugin extends Plugin {
	async onload() {
		console.log('Loading Bullet Flow plugin');

		// Test command to verify plugin is working
		this.addCommand({
			id: 'test-command',
			name: 'Test - Plugin is working!',
			callback: () => {
				new Notice('✨ MAGIC CONFIRMED! Auto-deploy is live! ✨');
			}
		});
	}

	onunload() {
		console.log('Unloading Bullet Flow plugin');
	}
}
