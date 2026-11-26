import { MarkdownView, Notice } from 'obsidian';
import type BulletFlowPlugin from '../main';
import type { NewProjectInput } from '../types';
import { NOTICE_TIMEOUT_ERROR, NOTICE_TIMEOUT_SUCCESS } from '../config';
import { promptForNewProject } from '../adapters/newProjectPrompt';
import { createProjectNote } from '../adapters/projectCreator';
import { buildProjectLink, effectiveAlias, projectNotePath, validateNewProjectInput } from '../utils/newProject';

type Prompt = (plugin: BulletFlowPlugin) => Promise<NewProjectInput | null>;

/** Where the link goes: the active editor's selection when the command started. */
interface InsertionPoint {
	sourcePath: string;
	insert: ((text: string) => void) | null;
}

function captureInsertionPoint(plugin: BulletFlowPlugin): InsertionPoint {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view?.editor) return { sourcePath: '', insert: null };
	const { editor } = view;
	const from = editor.getCursor('from');
	const to = editor.getCursor('to');
	return {
		sourcePath: view.file?.path ?? '',
		insert: text => {
			editor.setSelection(from, to);
			editor.replaceSelection(text);
		}
	};
}

/**
 * Create a project note in the projects folder (in the background, from the
 * Templater folder template when one applies) and insert a link to it where
 * the cursor was when the command started.
 *
 * @param prompt - Asks for the name and alias; injectable for tests
 */
export async function newProject(
	plugin: BulletFlowPlugin,
	prompt: Prompt = p => promptForNewProject(p.app, name =>
		!!p.app.vault.getAbstractFileByPath(projectNotePath(p.settings.projectsFolder, name)))
): Promise<void> {
	try {
		const point = captureInsertionPoint(plugin);

		const input = await prompt(plugin);
		if (!input) return;

		const validated = validateNewProjectInput(input);
		if (!validated.ok) {
			new Notice(`New project: ${validated.error}`, NOTICE_TIMEOUT_ERROR);
			return;
		}
		const { name } = validated.value;
		const alias = effectiveAlias(name, validated.value.alias);
		const folder = plugin.settings.projectsFolder;

		const result = await createProjectNote(plugin.app, folder, projectNotePath(folder, name), alias);
		if (result.existed) {
			new Notice(`New project: ${name} already exists; nothing was created or linked.`, NOTICE_TIMEOUT_ERROR);
			return;
		}
		const linkTarget = plugin.app.metadataCache.fileToLinktext(result.file, point.sourcePath, true);
		const link = buildProjectLink(linkTarget, alias);

		const messages = [`created ${name}`];
		if (result.templateUnavailable) messages.push("Templater's folder template could not be applied");
		if (point.insert) {
			point.insert(link);
		} else {
			messages.push('no link inserted (no active note)');
		}
		new Notice(`New project: ${messages.join('; ')}.`, NOTICE_TIMEOUT_SUCCESS);
	} catch (e: any) {
		new Notice(`New project error: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('newProject error:', e);
	}
}
