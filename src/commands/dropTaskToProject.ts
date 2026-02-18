import { App, Notice, TFile } from 'obsidian';
import type BulletFlowPlugin from '../main';
import {
	dedentLinesByAmount,
	extractTaskText,
	insertMultipleTasksWithDeduplication,
	TaskMarker
} from '../utils/tasks';
import type { BulletFlowSettings, ChildrenBlock, TaskInsertItem } from '../types';
import { findChildrenBlockFromListItems } from '../utils/listItems';
import { countIndent } from '../utils/indent';
import { getActiveMarkdownFile, getListItems, findSelectedTaskLines } from '../utils/commandSetup';
import { findProjectLinkInAncestors, isProjectNote } from '../utils/projects';
import { ObsidianLinkResolver } from '../utils/wikilinks';
import { NOTICE_TIMEOUT_ERROR } from '../config';
import { ProjectNotePicker } from '../ui/ProjectNotePicker';

/** Collected data for a single task before any mutations. */
interface CollectedTask {
	taskLine: number;
	children: ChildrenBlock | null;
	projectFile: TFile | null;
	projectPath: string | null;
	item: TaskInsertItem;
}

/**
 * Drop tasks from a periodic note to their project note.
 *
 * Behavior:
 * 1. Find [[project link]] on the task line or by walking up parent hierarchy
 * 2. If no link found, show a project picker for the user to choose
 * 3. If task already exists in project as [<]: reopen as [ ], merge children
 * 4. If task doesn't exist in project: add as new [ ] under configured heading
 * 5. Delete the task (and children) from the periodic note
 *
 * @param plugin - BulletFlow plugin instance
 * @param pickProject - Optional project picker function (for testability)
 */
export async function dropTaskToProject(
	plugin: BulletFlowPlugin,
	pickProject: (app: App, settings: BulletFlowSettings) => Promise<TFile | null> = ProjectNotePicker.pick
): Promise<void> {
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

		const taskLines = findSelectedTaskLines(editor, listItems, 'dropTaskToProject');
		if (!taskLines) return;

		// Process tasks from bottom to top to preserve line numbers during deletion
		taskLines.sort((a, b) => b - a);

		// Phase 1: Collect task data (no mutations)
		const linkedTasks: CollectedTask[] = [];
		const unlinkedTasks: CollectedTask[] = [];

		for (const taskLine of taskLines) {
			const lineText = editor.getLine(taskLine);

			const projectLink = findProjectLinkInAncestors(
				editor,
				listItems,
				taskLine,
				file.path,
				resolver,
				plugin.settings
			);

			const children = findChildrenBlockFromListItems(editor, listItems || [], taskLine);
			const parentIndent = countIndent(lineText);
			const parentLineStripped = lineText.slice(parentIndent);

			// Prepare children content (dedented)
			let childrenContent = '';
			if (children && children.lines.length > 0) {
				const dedentedChildren = dedentLinesByAmount(children.lines, parentIndent);
				childrenContent = dedentedChildren.join('\n');
			}

			if (projectLink) {
				// Resolve the project file
				const projectFile = plugin.app.vault.getAbstractFileByPath(projectLink.link.path) as TFile;
				if (!projectFile) {
					new Notice(`dropTaskToProject: Project note not found: ${projectLink.link.path}`);
					continue;
				}

				// Strip [[Project]] prefix for matching and for the project note version
				let rawTaskText = extractTaskText(lineText);
				const linkPrefix = `[[${projectLink.link.basename}]] `;
				if (rawTaskText.startsWith(linkPrefix)) {
					rawTaskText = rawTaskText.slice(linkPrefix.length);
				}
				const parentLineForProject = TaskMarker.stripProjectLink(parentLineStripped, projectLink.link.basename);

				linkedTasks.push({
					taskLine,
					children,
					projectFile,
					projectPath: projectLink.link.path,
					item: buildTaskInsertItem(rawTaskText, parentLineForProject, childrenContent)
				});
			} else {
				// No project link — will need the picker
				const rawTaskText = extractTaskText(lineText);
				unlinkedTasks.push({
					taskLine,
					children,
					projectFile: null,
					projectPath: null,
					item: buildTaskInsertItem(rawTaskText, parentLineStripped, childrenContent)
				});
			}
		}

		// Phase 2: Show picker for unlinked tasks (if any)
		if (unlinkedTasks.length > 0) {
			const pickedFile = await pickProject(plugin.app, plugin.settings);
			if (pickedFile) {
				for (const task of unlinkedTasks) {
					task.projectFile = pickedFile;
					task.projectPath = pickedFile.path;
				}
				linkedTasks.push(...unlinkedTasks);
			}
			// If user cancelled, unlinked tasks are simply discarded
		}

		if (linkedTasks.length === 0) {
			return;
		}

		// Phase 3: Delete from source (bottom-to-top by line number)
		// Re-sort since we may have merged linked + unlinked tasks
		linkedTasks.sort((a, b) => b.taskLine - a.taskLine);

		for (const task of linkedTasks) {
			// Delete children from source first (higher line numbers)
			if (task.children && task.children.lines.length > 0) {
				editor.replaceRange(
					'',
					{ line: task.children.startLine, ch: 0 },
					{ line: task.children.endLine, ch: 0 }
				);
			}

			// Delete the task line from source
			editor.replaceRange(
				'',
				{ line: task.taskLine, ch: 0 },
				{ line: task.taskLine + 1, ch: 0 }
			);
		}

		// Phase 4: Batch insert into each project in original order
		const tasksByProject = new Map<string, { file: TFile; items: TaskInsertItem[] }>();
		for (const task of linkedTasks) {
			const path = task.projectPath!;
			if (!tasksByProject.has(path)) {
				tasksByProject.set(path, { file: task.projectFile!, items: [] });
			}
			tasksByProject.get(path)!.items.push(task.item);
		}

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

		const droppedCount = linkedTasks.length;
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
		console.error('dropTaskToProject error:', e);
	}
}

/**
 * Build a TaskInsertItem from prepared task components.
 */
function buildTaskInsertItem(
	rawTaskText: string,
	parentLineForProject: string,
	childrenContent: string
): TaskInsertItem {
	let taskContent = parentLineForProject;
	if (childrenContent) {
		const indentedChildren = childrenContent.split('\n').map(line =>
			line ? '  ' + line : line
		).join('\n');
		taskContent += '\n' + indentedChildren;
	}
	return { taskText: rawTaskText, taskContent, childrenContent };
}
