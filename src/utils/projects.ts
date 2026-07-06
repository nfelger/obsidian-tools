/**
 * Utilities for working with project notes.
 *
 * A project note is a markdown file at the top level of the configured projects folder.
 */

import type { ListItem, BulletFlowSettings, ResolvedLink, LinkResolver } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { buildLineToItemMap } from './listItems';
import { countIndent, getLeadingWhitespace, detectIndentUnit, convertIndentUnit, indentLinesWith } from './indent';
import { findFirstResolvedLink, parseWikilinkText } from './wikilinks';
import { TaskMarker, extractTaskText } from './tasks';

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
	const lineMap = buildLineToItemMap(listItems);
	let currentLine: number | undefined = startLine;

	while (currentLine !== undefined && currentLine >= 0) {
		const lineText = editor.getLine(currentLine);
		const link = findFirstResolvedLink(lineText, sourcePath, resolver);

		if (link && isProjectLink(link, settings)) {
			return { link, line: currentLine };
		}

		// Walk up to parent
		const item: ListItem | null = lineMap.get(currentLine) ?? null;
		if (!item || typeof item.parent !== 'number' || item.parent < 0) {
			break;
		}
		currentLine = item.parent;
	}

	return null;
}

/**
 * A leading [[...]] prefix parsed from task text (the part after the checkbox).
 */
export interface ParsedProjectPrefix {
	/** Link target (before | and #), possibly path-form (e.g. "1 Projekte/P") */
	linkTarget: string;
	alias: string | null;
	/** The full wikilink as written, e.g. "[[Project|EU]]" */
	linkText: string;
	/** Task text after the prefix */
	rest: string;
}

/**
 * Parse a leading wikilink prefix from task text (the part after the
 * checkbox). Returns null when the text doesn't start with a link or nothing
 * follows it — a pure link bullet is not a prefixed task.
 */
export function parseProjectPrefix(taskText: string): ParsedProjectPrefix | null {
	const match = taskText.match(/^\[\[([^\]]+)\]\]\s+(\S.*)$/);
	if (!match) return null;
	const { linkPath, alias } = parseWikilinkText(match[1]);
	if (!linkPath) return null;
	return { linkTarget: linkPath, alias, linkText: `[[${match[1]}]]`, rest: match[2] };
}

/**
 * The basename segment of a link target, e.g. "1 Projekte/Project" → "Project".
 */
export function linkTargetBasename(linkTarget: string): string {
	return linkTarget.split('/').pop() ?? linkTarget;
}

/**
 * Strip a leading project-link prefix from task text when it points at the
 * given project (alias- and path-aware).
 *
 * Used to recover the project note's version of a task text from its
 * daily-note copy, which takeProjectTask prefixes with the project link.
 */
export function stripProjectPrefix(taskText: string, projectName: string): string {
	const prefix = parseProjectPrefix(taskText);
	if (prefix && linkTargetBasename(prefix.linkTarget) === projectName) return prefix.rest;
	return taskText;
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

export interface CollectorLink {
	alias: string | null;
	/** The collector's wikilink as written, e.g. "[[P|prio]]" */
	linkText: string;
}

/**
 * Check whether a line is a collector for the given project: a plain bullet
 * or live task whose content is exactly "<keyword> <wikilink>" where the
 * link's target basename is the project (alias-aware).
 */
export function parseCollectorLine(
	line: string,
	projectName: string,
	keywords: string[]
): CollectorLink | null {
	const match = line.match(/^\s*- (?:\[([ /])\] )?(.*)$/);
	if (!match) return null;
	const content = match[2].trim();
	for (const keyword of keywords) {
		if (!content.startsWith(keyword + ' ')) continue;
		const linkMatch = content.slice(keyword.length + 1).match(/^\[\[([^\]]+)\]\]$/);
		if (!linkMatch) continue;
		const { linkPath, alias } = parseWikilinkText(linkMatch[1]);
		if (linkTargetBasename(linkPath) === projectName) {
			return { alias, linkText: linkMatch[0] };
		}
	}
	return null;
}

export interface CollectorMatch extends CollectorLink {
	line: number;
}

/** Find the first collector for the project inside a section range. */
export function findCollector(
	lines: string[],
	range: { start: number; end: number },
	projectName: string,
	keywords: string[]
): CollectorMatch | null {
	for (let i = range.start + 1; i < range.end; i++) {
		const link = parseCollectorLine(lines[i], projectName, keywords);
		if (link) return { line: i, ...link };
	}
	return null;
}

export interface PrefixedTaskMatch {
	line: number;
	alias: string | null;
}

/**
 * Find top-level live tasks in a section carrying a prefix for the project.
 * Nested tasks are excluded — consolidation never restructures someone
 * else's hierarchy.
 */
export function findPrefixedProjectTasks(
	lines: string[],
	range: { start: number; end: number },
	projectName: string
): PrefixedTaskMatch[] {
	const matches: PrefixedTaskMatch[] = [];
	for (let i = range.start + 1; i < range.end; i++) {
		if (countIndent(lines[i]) > 0) continue;
		const marker = TaskMarker.fromLine(lines[i]);
		if (!marker || !(marker.isIncomplete() || marker.isScheduled())) continue;
		const prefix = parseProjectPrefix(extractTaskText(lines[i]));
		if (prefix && linkTargetBasename(prefix.linkTarget) === projectName) {
			matches.push({ line: i, alias: prefix.alias });
		}
	}
	return matches;
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

	// Nest the task content one level under the collector, matching the
	// file's indentation unit (falling back to the block's own unit, then tabs)
	const blockLines = taskContent.split('\n');
	const unit = detectIndentUnit(lines) ?? detectIndentUnit(blockLines) ?? '\t';
	const converted = convertIndentUnit(blockLines, unit);
	const prefix = getLeadingWhitespace(lines[collectorLine]) + unit;
	const indentedContent = indentLinesWith(converted, prefix).join('\n');

	lines.splice(insertLine, 0, indentedContent);
	return lines.join('\n');
}

