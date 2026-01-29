import { App, Modal } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { extractLog } from '../commands/extractLog';
import { migrateTask } from '../commands/migrateTask';
import { pushTaskDown } from '../commands/pushTaskDown';
import { pullTaskUp } from '../commands/pullTaskUp';

interface HotkeyBinding {
	key: string;
	label: string;
	command: () => void | Promise<void>;
}

export class HotkeyModal extends Modal {
	private plugin: BulletFlowPlugin;
	private bindings: HotkeyBinding[];

	constructor(app: App, plugin: BulletFlowPlugin) {
		super(app);
		this.plugin = plugin;
		this.bindings = this.buildBindings();
	}

	private buildBindings(): HotkeyBinding[] {
		return [
			{ key: 'm', label: 'Migrate task', command: () => migrateTask(this.plugin) },
			{ key: 'd', label: 'Push task down', command: () => pushTaskDown(this.plugin) },
			{ key: 'u', label: 'Pull task up', command: () => pullTaskUp(this.plugin) },
			{ key: 'e', label: 'Extract log', command: () => extractLog(this.plugin) },
		];
	}

	onOpen() {
		this.renderContent();
		this.registerKeyHandlers();
	}

	private renderContent() {
		const { contentEl } = this;
		contentEl.addClass('bullet-flow-hotkey-modal');

		const container = contentEl.createDiv({ cls: 'hotkey-list' });

		for (const binding of this.bindings) {
			const row = container.createDiv({ cls: 'hotkey-row' });
			row.createSpan({ cls: 'hotkey-key', text: binding.key });
			row.createSpan({ cls: 'hotkey-label', text: binding.label });
		}
	}

	private registerKeyHandlers() {
		for (const binding of this.bindings) {
			this.scope.register([], binding.key, (evt: KeyboardEvent) => {
				evt.preventDefault();
				this.close();
				binding.command();
				return false;
			});
		}
	}

	onClose() {
		this.contentEl.empty();
	}

	/**
	 * Get bindings for testing purposes
	 * @internal
	 */
	getBindings(): HotkeyBinding[] {
		return this.bindings;
	}
}
