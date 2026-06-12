import { Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import {
	buildTaskContent,
	dedentLinesByAmount,
	extractTaskText,
	insertMultipleTasksWithDeduplication,
	TaskMarker
} from '../utils/tasks';
import type { TaskInsertItem } from '../types';
import { findChildrenBlockFromListItems } from '../utils/listItems';
import { countIndent } from '../utils/indent';
import { getActiveMarkdownFile, getListItems, findSelectedTaskLines } from '../utils/commandSetup';
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
			new Notice('Drop task to project: Already in a project note.');
			return;
		}

		const listItems = getListItems(plugin, file);
		const resolver = new ObsidianLinkResolver(plugin.app.metadataCache, plugin.app.vault);

		const taskLines = findSelectedTaskLines(editor, listItems, 'Drop task to project');
		if (!taskLines) return;

		// Process tasks bottom-to-top so deferred source edits keep valid line numbers
		taskLines.sort((a, b) => b - a);

		// Phase 1: Collect task data (read-only — source deletions are deferred
		// until all project writes have succeeded, so a failure cannot lose tasks)
		// Group by project file for batch insertion
		const tasksByProject = new Map<string, { file: TFile; items: TaskInsertItem[] }>();
		const sourceDeletions: Array<{
			taskLine: number;
			children: ReturnType<typeof findChildrenBlockFromListItems>;
		}> = [];
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
				new Notice(`Drop task to project: No project link found for task on line ${taskLine + 1}.`);
				continue;
			}

			// Resolve the project file
			const projectFile = plugin.app.vault.getAbstractFileByPath(projectLink.link.path) as TFile;
			if (!projectFile) {
				new Notice(`Drop task to project: Project note not found: ${projectLink.link.path}`);
				continue;
			}

			const children = findChildrenBlockFromListItems(editor, listItems || [], taskLine);

			// Extract task text - strip any existing [[Project]] prefix for matching
			let rawTaskText = extractTaskText(lineText);
			// Remove [[ProjectName]] prefix if present
			const linkPrefix = `[[${projectLink.link.basename}]] `;
			if (rawTaskText.startsWith(linkPrefix)) {
				rawTaskText = rawTaskText.slice(linkPrefix.length);
			}

			// Build content for the project note (without project link prefix)
			const parentIndent = countIndent(lineText);
			const parentLineStripped = lineText.slice(parentIndent);
			// Strip project link from the task line for the project note version
			const parentLineForProject = TaskMarker.stripProjectLink(parentLineStripped, projectLink.link.basename);

			// Prepare children content (dedented)
			let childrenContent = '';
			if (children && children.lines.length > 0) {
				const dedentedChildren = dedentLinesByAmount(children.lines, parentIndent);
				childrenContent = dedentedChildren.join('\n');
			}

			// Build full task content for new insertions
			const taskContent = buildTaskContent(
				parentLineForProject,
				childrenContent ? childrenContent.split('\n') : []
			);

			// Group by project file path
			const projectPath = projectLink.link.path;
			if (!tasksByProject.has(projectPath)) {
				tasksByProject.set(projectPath, { file: projectFile, items: [] });
			}
			tasksByProject.get(projectPath)!.items.push({
				taskText: rawTaskText,
				taskContent,
				childrenContent
			});

			sourceDeletions.push({ taskLine, children });
			droppedCount++;
		}

		if (droppedCount === 0) {
			return;
		}

		// Phase 2: Batch insert into each project in original order
		let mergedCount = 0;
		let newCount = 0;

		for (const [, { file: projectFile, items }] of tasksByProject) {
			// Items were collected bottom-to-top, reverse to restore original order
			items.reverse();

			const targetHeading = plugin.settings.projectNoteTaskTargetHeading;
			await plugin.app.vault.process(projectFile, (data: string) => {
				const result = insertMultipleTasksWithDeduplication(data, items, targetHeading);
				mergedCount += result.mergedCount;
				newCount += result.newCount;
				return result.content;
			});
		}

		// Phase 3: Delete tasks from source (bottom-to-top)
		for (const deletion of sourceDeletions) {
			// Delete children first (higher line numbers), then the task line
			if (deletion.children && deletion.children.lines.length > 0) {
				editor.replaceRange(
					'',
					{ line: deletion.children.startLine, ch: 0 },
					{ line: deletion.children.endLine, ch: 0 }
				);
			}
			editor.replaceRange(
				'',
				{ line: deletion.taskLine, ch: 0 },
				{ line: deletion.taskLine + 1, ch: 0 }
			);
		}

		let message: string;
		if (droppedCount === 1) {
			message = mergedCount > 0
				? 'Drop task to project: Task returned to project (reopened).'
				: 'Drop task to project: Task added to project.';
		} else {
			const parts: string[] = [];
			if (newCount > 0) parts.push(`${newCount} new`);
			if (mergedCount > 0) parts.push(`${mergedCount} reopened`);
			message = `Drop task to project: ${droppedCount} tasks dropped to project (${parts.join(', ')}).`;
		}
		new Notice(message);
	} catch (e: any) {
		new Notice(`Drop task to project error: ${e.message}`, NOTICE_TIMEOUT_ERROR);
		console.error('dropTaskToProject error:', e);
	}
}

