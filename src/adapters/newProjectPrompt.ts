import { App, Modal } from 'obsidian';
import type { NewProjectInput } from '../types';
import { projectNameProblem } from '../utils/newProject';

const NAME_ID = 'bullet-flow-new-project-name';
const ALIAS_ID = 'bullet-flow-new-project-alias';
const NAME_ERROR_ID = 'bullet-flow-new-project-name-error';

/**
 * Asks for a new project's full name and alias in a stacked form: each field
 * has its label above it, and Cancel / Create project buttons close the form.
 *
 * `ask()` resolves with the trimmed fields when the form is submitted (the
 * Create project button, or Enter in either field) with a usable full name,
 * or null when it is dismissed (Cancel, Escape or clicking away). An empty
 * or filename-invalid name shows an error under the field and keeps the
 * form open.
 */
export class NewProjectModal extends Modal {
	private submitted: NewProjectInput | null = null;
	private settle: ((input: NewProjectInput | null) => void) | null = null;
	nameInput: HTMLInputElement | null = null;
	aliasInput: HTMLInputElement | null = null;
	private nameError: HTMLElement | null = null;

	ask(): Promise<NewProjectInput | null> {
		return new Promise(resolve => {
			this.settle = resolve;
			this.open();
		});
	}

	onOpen() {
		const { contentEl } = this;
		this.setTitle('New project');
		contentEl.addClass('bullet-flow-new-project');

		const nameField = contentEl.createDiv({ cls: 'new-project-field' });
		nameField.createEl('label', { text: 'Full name', attr: { for: NAME_ID } });
		const nameInput = this.createInput(nameField, NAME_ID, 'Migration Initiative');
		this.nameInput = nameInput;
		nameInput.setAttribute('aria-describedby', NAME_ERROR_ID);
		this.nameError = nameField.createDiv({
			cls: 'new-project-error',
			attr: { id: NAME_ERROR_ID, 'aria-live': 'polite' }
		});
		nameInput.addEventListener('input', () => this.clearError());

		const aliasField = contentEl.createDiv({ cls: 'new-project-field' });
		aliasField.createEl('label', { text: 'Alias', attr: { for: ALIAS_ID } });
		this.aliasInput = this.createInput(aliasField, ALIAS_ID, 'migration');
		aliasField.createDiv({ cls: 'new-project-description', text: 'Shown in the link. Optional.' });

		const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
		buttons.createEl('button', { text: 'Cancel' })
			.addEventListener('click', () => this.close());
		buttons.createEl('button', { cls: 'mod-cta', text: 'Create project' })
			.addEventListener('click', () => this.submit());

		nameInput.focus();
	}

	private createInput(field: HTMLElement, id: string, example: string): HTMLInputElement {
		const input = field.createEl('input', { type: 'text', attr: { id, placeholder: example } });
		input.value = '';
		input.addEventListener('keydown', (evt: KeyboardEvent) => {
			if (evt.key !== 'Enter' || evt.isComposing) return;
			evt.preventDefault();
			this.submit();
		});
		return input;
	}

	private clearError(): void {
		this.nameError?.setText('');
		this.nameInput?.removeAttribute('aria-invalid');
	}

	/** Submit the form; a name that can't be used shows why and keeps it open. */
	submit(): void {
		const name = this.nameInput?.value ?? '';
		const problem = projectNameProblem(name);
		if (problem) {
			this.nameError?.setText(problem);
			this.nameInput?.setAttribute('aria-invalid', 'true');
			this.nameInput?.focus();
			return;
		}
		this.submitted = { name: name.trim(), alias: (this.aliasInput?.value ?? '').trim() };
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
