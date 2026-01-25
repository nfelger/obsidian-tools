import { Plugin } from 'obsidian';
import { extractLog } from './commands/extractLog';
import { migrateTask } from './commands/migrateTask';

const CUSTOM_CHECKBOX_CSS = `
/* [o] Meeting marker */

input[data-task="o"]:checked,
li[data-task="o"] > input:checked,
li[data-task="o"] > p > input:checked {
  --checkbox-marker-color: transparent;
  border: none;
  border-radius: 0;
  background-image: none;
  background-color: currentColor;
  -webkit-mask-size: var(--checkbox-icon);
  -webkit-mask-position: 50% 50%;
}

input[data-task="o"]:checked,
li[data-task="o"] > input:checked,
li[data-task="o"] > p > input:checked {
  color: var(--color-red);
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' viewBox='0 0 20 20' fill='currentColor'%3E%3Cpath fill-rule='evenodd' d='M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z' clip-rule='evenodd' /%3E%3C/svg%3E");
}
`;

export default class BulletFlowPlugin extends Plugin {
	private styleEl?: HTMLStyleElement;

	async onload() {
		console.log('Loading Bullet Flow plugin');

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

	private injectCustomCSS() {
		// Create style element
		this.styleEl = document.createElement('style');
		this.styleEl.id = 'bullet-flow-custom-checkboxes';
		this.styleEl.textContent = CUSTOM_CHECKBOX_CSS;

		// Add to document head
		document.head.appendChild(this.styleEl);
	}
}
