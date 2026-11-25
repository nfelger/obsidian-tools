import { App, Modal } from 'obsidian';
import type { NewProjectInput } from '../types';

/**
 * Asks for a new project's full name and alias.
 *
 * `ask()` resolves with the entered fields when the user presses Enter with
 * a non-blank full name, or null when the form is dismissed (Escape or
 * clicking away). Enter with a blank full name keeps the form open.
 */
export class NewProjectModal extends Modal {
	private submitted: NewProjectInput | null = null;
	private settle: ((input: NewProjectInput | null) => void) | null = null;
	nameInput: HTMLInputElement | null = null;
	aliasInput: HTMLInputElement | null = null;

	ask(): Promise<NewProjectInput | null> {
		return new Promise(resolve => {
			this.settle = resolve;
			this.open();
		});
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('bullet-flow-new-project');
		contentEl.createDiv({ cls: 'new-project-title', text: 'New project' });
		this.nameInput = contentEl.createEl('input', {
			type: 'text',
			cls: 'new-project-name',
			attr: { placeholder: 'Full name' }
		});
		this.aliasInput = contentEl.createEl('input', {
			type: 'text',
			cls: 'new-project-alias',
			attr: { placeholder: 'Alias (optional)' }
		});
		this.nameInput.value = '';
		this.aliasInput.value = '';
		this.scope.register([], 'Enter', (evt: KeyboardEvent) => {
			evt.preventDefault();
			this.submit();
			return false;
		});
		this.nameInput.focus();
	}

	/** Submit the form; a blank full name keeps it open. */
	submit(): void {
		const name = this.nameInput?.value ?? '';
		if (!name.trim()) {
			this.nameInput?.focus();
			return;
		}
		this.submitted = { name, alias: this.aliasInput?.value ?? '' };
		this.close();
	}

	onClose() {
		this.contentEl.empty();
		const settle = this.settle;
		this.settle = null;
		settle?.(this.submitted);
	}
}

/** Ask for a new project's name and alias; null when dismissed. */
export function promptForNewProject(app: App): Promise<NewProjectInput | null> {
	return new NewProjectModal(app).ask();
}
