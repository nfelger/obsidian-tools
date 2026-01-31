import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import {
	isIncompleteTask,
	dedentLinesByAmount,
	findTopLevelTasksInRange,
	extractTaskText,
	insertTaskWithDeduplication
} from '../utils/tasks';
import { findChildrenBlockFromListItems } from '../utils/listItems';
import { countIndent } from '../utils/indent';
import { getActiveMarkdownFile, getListItems } from '../utils/commandSetup';
import { findProjectLinkInAncestors, isProjectNote } from '../utils/projects';
import { ObsidianLinkResolver } from '../utils/wikilinks';
import { NOTICE_TIMEOUT_ERROR } from '../config';

/**
 * Drop tasks from a periodic note to their project note.
 *
 * Behavior:
 * 1. Find [[project link]] on the task line or by walking up parent hierarchy
 * 2. Verify the link points to a project note
 * 3. If task already exists in project as [<]: reopen as [ ], merge children
 * 4. If task doesn't exist in project: add as new [ ] under configured heading
 * 5. Delete the task (and children) from the periodic note
 *
 * @param plugin - BulletFlow plugin instance
 */
export async function dropTaskToProject(plugin: BulletFlowPlugin): Promise<void> {
	try {
		const context = getActiveMarkdownFile(plugin);
		if (!context) return;

		const { editor, file } = context;

		// Should not be used from a project note itself
		if (isProjectNote(file.path, plugin.settings)) {
			new Notice('dropTaskToProject: Already in a project note.');
			return;
		}

		const listItems = getListItems(plugin, file);
		const resolver = new ObsidianLinkResolver(plugin.app.metadataCache, plugin.app.vault);

		// Find tasks to drop (single cursor or multi-select)
		let taskLines: number[];
		if (editor.somethingSelected()) {
			const selections = editor.listSelections();
			const selection = selections[0];
			const startLine = Math.min(selection.anchor.line, selection.head.line);
			const endLine = Math.max(selection.anchor.line, selection.head.line);

			taskLines = findTopLevelTasksInRange(editor, listItems || [], startLine, endLine);

			if (taskLines.length === 0) {
				new Notice('dropTaskToProject: No incomplete tasks in selection.');
				return;
			}
		} else {
			const currentLine = editor.getCursor().line;
			const lineText = editor.getLine(currentLine);

			if (!isIncompleteTask(lineText)) {
				new Notice('dropTaskToProject: Cursor is not on an incomplete task.');
				return;
			}

			taskLines = [currentLine];
		}

		// Process tasks from bottom to top to preserve line numbers
		taskLines.sort((a, b) => b - a);

		let mergedCount = 0;
		let newCount = 0;
		let droppedCount = 0;

		for (const taskLine of taskLines) {
			const lineText = editor.getLine(taskLine);

			// Find project link on this line or ancestors
			const projectLink = findProjectLinkInAncestors(
				editor,
				listItems,
				taskLine,
				file.path,
				resolver,
				plugin.settings
			);

			if (!projectLink) {
				new Notice(`dropTaskToProject: No project link found for task on line ${taskLine + 1}.`);
				continue;
			}

			// Resolve the project file
			const projectFile = plugin.app.vault.getAbstractFileByPath(projectLink.link.path) as TFile;
			if (!projectFile) {
				new Notice(`dropTaskToProject: Project note not found: ${projectLink.link.path}`);
				continue;
			}

			const children = findChildrenBlockFromListItems(editor, listItems || [], taskLine);

			// Extract task text - strip any existing [[Project]] prefix for matching
			let rawTaskText = extractTaskText(lineText);
			// Remove [[ProjectName]] prefix if present
			const projectLinkPattern = new RegExp(`^\\[\\[${escapeRegex(projectLink.link.basename)}\\]\\]\\s*`);
			rawTaskText = rawTaskText.replace(projectLinkPattern, '');

			// Build content for the project note (without project link prefix)
			const parentIndent = countIndent(lineText);
			const parentLineStripped = lineText.slice(parentIndent);
			// Strip project link from the task line for the project note version
			const parentLineForProject = stripProjectLinkFromTask(parentLineStripped, projectLink.link.basename);

			// Prepare children content (dedented)
			let childrenContent = '';
			if (children && children.lines.length > 0) {
				const dedentedChildren = dedentLinesByAmount(children.lines, parentIndent);
				childrenContent = dedentedChildren.join('\n');
			}

			// Build full task content for new insertions
			let taskContent = parentLineForProject;
			if (childrenContent) {
				const indentedChildren = childrenContent.split('\n').map(line =>
					line ? '  ' + line : line
				).join('\n');
				taskContent += '\n' + indentedChildren;
			}

			// Insert into project note with deduplication
			const targetHeading = plugin.settings.projectNoteTaskTargetHeading;
			await plugin.app.vault.process(projectFile, (data: string) => {
				const result = insertTaskWithDeduplication(
					data,
					rawTaskText,
					taskContent,
					childrenContent,
					targetHeading
				);
				if (result.wasMerged) {
					mergedCount++;
				} else {
					newCount++;
				}
				return result.content;
			});

			// Delete children from source first (higher line numbers)
			if (children && children.lines.length > 0) {
				editor.replaceRange(
					'',
					{ line: children.startLine, ch: 0 },
					{ line: children.endLine, ch: 0 }
				);
			}

			// Delete the task line from source
			editor.replaceRange(
				'',
				{ line: taskLine, ch: 0 },
				{ line: taskLine + 1, ch: 0 }
			);

			droppedCount++;
		}

		if (droppedCount === 0) {
			return;
		}

		let message: string;
		if (droppedCount === 1) {
			message = mergedCount > 0
				? 'dropTaskToProject: Task returned to project (reopened).'
				: 'dropTaskToProject: Task added to project.';
		} else {
			const parts: string[] = [];
			if (newCount > 0) parts.push(`${newCount} new`);
			if (mergedCount > 0) parts.push(`${mergedCount} reopened`);
			message = `dropTaskToProject: ${droppedCount} tasks dropped to project (${parts.join(', ')}).`;
		}
		new Notice(message);
	} catch (e: any) {
		new Notice(`dropTaskToProject ERROR: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.log('dropTaskToProject ERROR', e);
	}
}

/**
 * Strip the [[ProjectName]] prefix from a task line.
 * Handles the format: "- [ ] [[Project]] Task text" → "- [ ] Task text"
 */
function stripProjectLinkFromTask(line: string, projectName: string): string {
	const pattern = new RegExp(`(- \\[.\\]\\s*)\\[\\[${escapeRegex(projectName)}\\]\\]\\s*`);
	return line.replace(pattern, '$1');
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
