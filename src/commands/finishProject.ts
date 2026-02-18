import { Notice } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { getActiveMarkdownFile } from '../utils/commandSetup';
import { isProjectNote } from '../utils/projects';
import { NOTICE_TIMEOUT_ERROR } from '../config';

/**
 * Finish a project: add completion date to frontmatter, rename with ✅ prefix,
 * and move to the archive folder.
 *
 * @param plugin - BulletFlow plugin instance
 */
export async function finishProject(plugin: BulletFlowPlugin): Promise<void> {
	try {
		const context = getActiveMarkdownFile(plugin);
		if (!context) return;

		const { file } = context;

		if (!isProjectNote(file.path, plugin.settings)) {
			new Notice('finishProject: Not a project note.');
			return;
		}

		if (file.basename.startsWith('✅')) {
			new Notice('finishProject: Project is already finished.');
			return;
		}

		const today = plugin.getToday();
		const dateStr = formatDate(today);

		await plugin.app.vault.process(file, (content: string) => {
			return addCompletedDate(content, dateStr);
		});

		const archiveFolder = plugin.settings.projectArchiveFolder;
		const newPath = `${archiveFolder}/✅ ${file.basename}.md`;

		if (!plugin.app.vault.getAbstractFileByPath(archiveFolder)) {
			await plugin.app.vault.createFolder(archiveFolder);
		}

		await plugin.app.fileManager.renameFile(file, newPath);

		new Notice(`finishProject: ${file.basename} archived.`);
	} catch (e: any) {
		new Notice(`finishProject ERROR: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('finishProject error:', e);
	}
}

/**
 * Format a Date as YYYY-MM-DD.
 */
export function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Add or update a `completed` property in YAML frontmatter.
 *
 * - If frontmatter exists with `completed:` → updates the value
 * - If frontmatter exists without `completed:` → appends the property
 * - If no frontmatter → creates frontmatter with the property
 */
export function addCompletedDate(content: string, date: string): string {
	const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
	const match = content.match(frontmatterRegex);

	if (match) {
		const frontmatter = match[1];
		if (/^completed:/m.test(frontmatter)) {
			const updated = frontmatter.replace(/^completed:.*$/m, `completed: ${date}`);
			return content.replace(frontmatterRegex, `---\n${updated}\n---`);
		}
		return content.replace(frontmatterRegex, `---\n${frontmatter}\ncompleted: ${date}\n---`);
	}

	return `---\ncompleted: ${date}\n---\n${content}`;
}
