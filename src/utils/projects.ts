/**
 * Utilities for working with project notes.
 *
 * A project note is a markdown file at the top level of the configured projects folder.
 */

import type { ListItem, BulletFlowSettings, ResolvedLink, LinkResolver } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { getListItemAtLine } from './listItems';
import { countIndent, indentLines } from './indent';
import { findFirstResolvedLink } from './wikilinks';

/**
 * Check if a file path represents a project note.
 *
 * A project note is a markdown file directly inside the projects folder (not nested).
 *
 * @param filePath - Full path to the file (e.g., '1 Projekte/Migration Initiative.md')
 * @param settings - Plugin settings
 * @returns true if the file is a top-level project note
 */
export function isProjectNote(
	filePath: string,
	settings: BulletFlowSettings = DEFAULT_SETTINGS
): boolean {
	const projectsFolder = settings.projectsFolder;
	if (!projectsFolder || !filePath) return false;

	// Must be inside the projects folder
	if (!filePath.startsWith(projectsFolder + '/')) return false;

	// Must be directly inside (no further subdirectories)
	const relativePath = filePath.slice(projectsFolder.length + 1);
	return !relativePath.includes('/');
}

/**
 * Extract the project name from a file path.
 *
 * @param filePath - Full path to a project note
 * @returns The project name (filename without extension), or null if not a project note
 */
export function getProjectName(filePath: string, settings: BulletFlowSettings = DEFAULT_SETTINGS): string | null {
	if (!isProjectNote(filePath, settings)) return null;
	const filename = filePath.split('/').pop();
	if (!filename) return null;
	return filename.replace(/\.md$/, '');
}

/**
 * Check if a resolved link points to a project note.
 *
 * @param link - The resolved link
 * @param settings - Plugin settings
 * @returns true if the link points to a project note
 */
export function isProjectLink(
	link: ResolvedLink,
	settings: BulletFlowSettings = DEFAULT_SETTINGS
): boolean {
	return isProjectNote(link.path, settings);
}

/**
 * Find a project link on the current line or by walking up the parent hierarchy.
 *
 * Searches the current line first, then walks up through parent list items
 * looking for a wikilink that resolves to a file in the projects folder.
 *
 * @param editor - Editor with getLine method
 * @param listItems - List items from metadata cache
 * @param startLine - Line to start searching from
 * @param sourcePath - Path of the source file (for link resolution)
 * @param resolver - Link resolver
 * @param settings - Plugin settings
 * @returns The resolved project link and the line it was found on, or null
 */
export function findProjectLinkInAncestors(
	editor: { getLine: (line: number) => string },
	listItems: ListItem[],
	startLine: number,
	sourcePath: string,
	resolver: LinkResolver,
	settings: BulletFlowSettings = DEFAULT_SETTINGS
): { link: ResolvedLink; line: number } | null {
	let currentLine: number | undefined = startLine;

	while (currentLine !== undefined && currentLine >= 0) {
		const lineText = editor.getLine(currentLine);
		const link = findFirstResolvedLink(lineText, sourcePath, resolver);

		if (link && isProjectLink(link, settings)) {
			return { link, line: currentLine };
		}

		// Walk up to parent
		const item = getListItemAtLine(listItems, currentLine);
		if (!item || typeof item.parent !== 'number' || item.parent < 0) {
			break;
		}
		currentLine = item.parent;
	}

	return null;
}

/**
 * Parse the projectKeywords setting into an array of keyword strings.
 *
 * The setting format is comma-separated, quote-enclosed: "Push", "Finish"
 *
 * @param keywordsSetting - The raw setting string
 * @returns Array of keyword strings
 */
export function parseProjectKeywords(keywordsSetting: string): string[] {
	if (!keywordsSetting) return [];

	const keywords: string[] = [];
	const regex = /"([^"]+)"/g;
	let match;

	while ((match = regex.exec(keywordsSetting)) !== null) {
		keywords.push(match[1]);
	}

	return keywords;
}

/**
 * Find a collector task in the daily note content.
 *
 * A collector task matches the pattern: - [ ] <keyword> [[Project Name]]
 * where keyword is one of the configured project keywords (exact prefix match).
 *
 * @param content - The daily note content
 * @param projectName - The project name to look for
 * @param keywords - Array of collector keywords
 * @returns The line number of the collector task, or null if not found
 */
export function findCollectorTask(
	content: string,
	projectName: string,
	keywords: string[]
): number | null {
	if (!keywords.length) return null;

	const lines = content.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Must be an incomplete task
		if (!/^\s*- \[[ /]\]/.test(line)) continue;

		// Extract text after checkbox
		const textMatch = line.match(/^\s*- \[[ /]\]\s+(.*)$/);
		if (!textMatch) continue;

		const taskText = textMatch[1];

		// Check each keyword for exact prefix match: <keyword> [[projectName]]
		for (const keyword of keywords) {
			if (taskText.startsWith(`${keyword} [[${projectName}]]`)) {
				return i;
			}
		}
	}

	return null;
}

/**
 * Insert tasks as subtasks under a collector task at the given line.
 *
 * @param content - The file content
 * @param collectorLine - Line number of the collector task
 * @param taskContent - The task content to insert (already formatted with project link)
 * @returns Updated file content
 */
export function insertUnderCollectorTask(
	content: string,
	collectorLine: number,
	taskContent: string
): string {
	const lines = content.split('\n');
	if (collectorLine < 0 || collectorLine >= lines.length) return content;

	// Find the end of existing subtasks under the collector
	let insertLine = collectorLine + 1;
	const collectorIndent = countIndent(lines[collectorLine]);

	while (insertLine < lines.length) {
		const currentLine = lines[insertLine];
		if (currentLine.trim() === '') {
			insertLine++;
			continue;
		}
		if (countIndent(currentLine) > collectorIndent) {
			insertLine++;
		} else {
			break;
		}
	}

	// Indent the task content to be a child of the collector
	const indentedContent = indentLines(taskContent.split('\n'), collectorIndent + 4).join('\n');

	lines.splice(insertLine, 0, indentedContent);
	return lines.join('\n');
}

/**
 * Remove a task line and its children from content.
 *
 * @param lines - Array of lines
 * @param taskLine - Line number of the task to remove
 * @param listItems - List items from metadata cache
 * @returns Updated array of lines with the task and children removed
 */
export function removeTaskAndChildren(
	lines: string[],
	taskLine: number,
	childStartLine?: number,
	childEndLine?: number
): string[] {
	const result = [...lines];

	if (childStartLine !== undefined && childEndLine !== undefined && childStartLine < childEndLine) {
		// Remove children first (higher line numbers)
		result.splice(childStartLine, childEndLine - childStartLine);
	}

	// Remove the task line itself
	const adjustedLine = (childStartLine !== undefined && childEndLine !== undefined && childStartLine <= taskLine)
		? taskLine
		: taskLine;
	result.splice(adjustedLine, 1);

	return result;
}
