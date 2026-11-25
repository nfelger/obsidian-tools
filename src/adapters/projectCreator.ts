import type { App, TFile, TFolder } from 'obsidian';
import { mergeAliasIntoFrontmatter } from '../utils/newProject';

/**
 * The slice of Templater's internal API used to apply folder templates —
 * the same calls the legacy handleNewNote script makes.
 */
interface TemplaterApi {
	get_new_file_template_for_folder?: (folder: TFolder) => string | undefined | null;
	write_template_to_file?: (templateFile: TFile, file: TFile) => Promise<void>;
}

export interface ProjectCreationResult {
	file: TFile;
	/** The note was already there and was left untouched */
	existed: boolean;
	/** Templater is installed but its folder-template API could not be used */
	templateUnavailable: boolean;
}

function getTemplater(app: App): TemplaterApi | null {
	const plugins = (app as any).plugins?.plugins;
	return plugins?.['templater-obsidian']?.templater ?? null;
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
	let dir = '';
	for (const part of folderPath.split('/').filter(Boolean)) {
		dir = dir ? `${dir}/${part}` : part;
		if (!app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
	}
}

/** Resolve the Templater folder template for a folder, if one applies. */
function resolveFolderTemplate(
	app: App,
	templater: TemplaterApi,
	folderPath: string
): TFile | null {
	const folder = app.vault.getAbstractFileByPath(folderPath) ?? app.vault.getRoot();
	const templatePath = templater.get_new_file_template_for_folder!(folder as TFolder);
	if (!templatePath) return null;
	return (app.vault.getAbstractFileByPath(templatePath) as TFile | null) ?? null;
}

/**
 * Create a project note in the background (it is not opened), applying the
 * Templater folder template for its folder exactly once and then recording
 * the alias in its frontmatter. An existing note is returned untouched.
 *
 * Templater's "Trigger on new file creation" only templates notes that are
 * created empty, so a note this function templates is created with a
 * placeholder line that the template then replaces.
 */
export async function createProjectNote(
	app: App,
	folderPath: string,
	path: string,
	alias: string | null
): Promise<ProjectCreationResult> {
	const existing = app.vault.getAbstractFileByPath(path) as TFile | null;
	if (existing) return { file: existing, existed: true, templateUnavailable: false };

	await ensureFolder(app, folderPath);

	const templater = getTemplater(app);
	const usable = !!templater?.get_new_file_template_for_folder && !!templater?.write_template_to_file;
	const templateFile = usable ? resolveFolderTemplate(app, templater!, folderPath) : null;

	const file = await app.vault.create(path, templateFile ? '\n' : '');
	if (templateFile) await templater!.write_template_to_file!(templateFile, file);

	if (alias) {
		await app.fileManager.processFrontMatter(file, frontmatter => mergeAliasIntoFrontmatter(frontmatter, alias));
	}

	return { file, existed: false, templateUnavailable: !!templater && !usable };
}
