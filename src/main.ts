import { Plugin, Notice } from 'obsidian';

export default class ObsidianToolsPlugin extends Plugin {
	async onload() {
		console.log('Loading Obsidian Tools plugin');

		// Test command to verify plugin is working
		this.addCommand({
			id: 'test-command',
			name: 'Test - Plugin is working!',
			callback: () => {
				new Notice('🎉 Obsidian Tools plugin is working!');
			}
		});
	}

	onunload() {
		console.log('Unloading Obsidian Tools plugin');
	}
}
