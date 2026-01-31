import { App, Modal } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { HOTKEY_BINDINGS, type CommandId } from '../config';
import { extractLog } from '../commands/extractLog';
import { migrateTask } from '../commands/migrateTask';
import { pushTaskDown } from '../commands/pushTaskDown';
import { pullTaskUp } from '../commands/pullTaskUp';
import { takeProjectTask } from '../commands/takeProjectTask';
import { dropTaskToProject } from '../commands/dropTaskToProject';

interface HotkeyBinding {
	key: string;
	label: string;
	command: () => void | Promise<void>;
}

type CommandFn = (plugin: BulletFlowPlugin) => void | Promise<void>;

const COMMAND_REGISTRY: Record<CommandId, CommandFn> = {
	'migrateTask': migrateTask,
	'pushTaskDown': pushTaskDown,
	'pullTaskUp': pullTaskUp,
	'extractLog': extractLog,
	'takeProjectTask': takeProjectTask,
	'dropTaskToProject': dropTaskToProject,
};

export class HotkeyModal extends Modal {
	private plugin: BulletFlowPlugin;
	private bindings: HotkeyBinding[];

	constructor(app: App, plugin: BulletFlowPlugin) {
		super(app);
		this.plugin = plugin;
		this.bindings = HOTKEY_BINDINGS.map(({ key, label, commandId }) => ({
			key,
			label,
			command: () => COMMAND_REGISTRY[commandId](this.plugin),
		}));
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
			row.addEventListener('click', () => {
				this.close();
				binding.command();
			});
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
