import { MarkdownView, Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { parseNoteType, getNextNotePath } from '../utils/periodicNotes';
import { isIncompleteTask, dedentLinesByAmount, insertUnderLogHeading } from '../utils/tasks';
import { findChildrenBlockFromListItems } from '../utils/listItems';
import { countIndent } from '../utils/indent';

/**
 * Migrate an incomplete task from the current periodic note to the next note.
 *
 * MVP (Slice 5): Daily notes only, single cursor, simple next-day migration
 *
 * Behavior:
 * 1. Check cursor is on incomplete task line
 * 2. Determine note type and target note
 * 3. Check target note exists
 * 4. Copy task (and children) to target under "## Log"
 * 5. Mark source task as migrated [>] and remove children
 *
 * @param plugin - BulletFlow plugin instance
 */
export async function migrateTask(plugin: BulletFlowPlugin): Promise<void> {
	try {
		// Get active markdown view
		const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice('migrateTask: No active markdown view.');
			return;
		}

		const editor = view.editor;
		const file = view.file;
		if (!file) {
			new Notice('migrateTask: No active file.');
			return;
		}

		// Parse note type (MVP: daily only)
		const noteInfo = parseNoteType(file.basename);
		if (!noteInfo) {
			new Notice('migrateTask: This is not a periodic note.');
			return;
		}

		if (noteInfo.type !== 'daily') {
			new Notice('migrateTask MVP: Only daily notes supported (full version in Slice 6).');
			return;
		}

		// Calculate target note path
		const targetPath = getNextNotePath(noteInfo) + '.md';

		// Check if target note exists
		const targetFile = plugin.app.vault.getAbstractFileByPath(targetPath) as TFile;
		if (!targetFile) {
			new Notice(`migrateTask: Target note does not exist: ${targetPath}`);
			return;
		}

		// Get list items metadata
		const fileCache = plugin.app.metadataCache.getFileCache(file);
		const listItems = fileCache?.listItems;

		// MVP: Single cursor only (no multi-select)
		const currentLine = editor.getCursor().line;
		const lineText = editor.getLine(currentLine);

		if (!isIncompleteTask(lineText)) {
			new Notice('migrateTask: Cursor is not on an incomplete task.');
			return;
		}

		// Find children
		const children = findChildrenBlockFromListItems(editor, listItems || [], currentLine);

		// Build content to migrate (parent line + children)
		const parentIndent = countIndent(lineText);
		const parentLineStripped = lineText.slice(parentIndent);

		// Convert started [/] to open [ ] in target
		const parentLineForTarget = parentLineStripped.replace(/^(- )\[\/\]/, '$1[ ]');

		let taskContent = parentLineForTarget;
		if (children && children.lines.length > 0) {
			const dedentedChildren = dedentLinesByAmount(children.lines, parentIndent);
			taskContent += '\n' + dedentedChildren.join('\n');
		}

		// Mark source line as migrated [>]
		const migratedLine = lineText.replace(/^(\s*- )\[[ /]\]/, '$1[>]');
		editor.setLine(currentLine, migratedLine);

		// Remove children from source
		if (children && children.lines.length > 0) {
			editor.replaceRange(
				'',
				{ line: children.startLine, ch: 0 },
				{ line: children.endLine, ch: 0 }
			);
		}

		// Add content to target note under ## Log
		await plugin.app.vault.process(targetFile, (data: string) => {
			return insertUnderLogHeading(data, taskContent);
		});

		new Notice('migrateTask: Task migrated successfully.');
	} catch (e: any) {
		new Notice(`migrateTask ERROR: ${e.message}`, 8000);
		console.log('migrateTask ERROR', e);
	}
}
