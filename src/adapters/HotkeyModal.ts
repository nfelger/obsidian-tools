import { App, Modal } from 'obsidian';
import { HOTKEY_BINDINGS, type CommandId } from '../config';

interface HotkeyBinding {
	key: string;
	label: string;
	command: () => void | Promise<void>;
}

/** What each command menu entry runs, resolved by the plugin entry point. */
export type HotkeyCommands = Record<CommandId, () => void | Promise<void>>;

export class HotkeyModal extends Modal {
	private bindings: HotkeyBinding[];

	constructor(app: App, commands: HotkeyCommands) {
		super(app);
		this.bindings = HOTKEY_BINDINGS.map(({ key, label, commandId }) => ({
			key,
			label,
			command: () => commands[commandId](),
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
