import type { TFile } from 'obsidian';

// === List Items ===

export interface ListItem {
	position: {
		start: { line: number; col: number; offset: number };
		end: { line: number; col: number; offset: number };
	};
	parent: number;
	task?: string;
}

export interface ChildrenBlock {
	startLine: number;
	endLine: number;
	lines: string[];
}

// === Wikilinks ===

/**
 * A resolved link with file information.
 * Domain type that doesn't depend on Obsidian's TFile.
 */
export interface ResolvedLink {
	/** Full path to the resolved file */
	path: string;
	/** File basename without extension */
	basename: string;
	/** File extension (e.g., 'md') */
	extension: string;
	/** Position where the link was found in the line */
	index: number;
	/** Original link text including brackets (e.g., "[[Note]]") */
	matchText: string;
	/** Content inside the brackets (e.g., "Note|Alias") */
	inner: string;
}

/**
 * Interface for resolving wikilinks to files.
 * Abstracts the Obsidian MetadataCache dependency.
 */
export interface LinkResolver {
	/**
	 * Resolve a link path to a file.
	 * @param linkPath - The link path (note name)
	 * @param sourcePath - The path of the source file for relative resolution
	 * @returns The resolved link info, or null if not found
	 */
	resolve(linkPath: string, sourcePath: string): ResolvedLink | null;
}

/**
 * Legacy WikiLink type that includes Obsidian's TFile.
 * @deprecated Use ResolvedLink for new code
 */
export interface WikiLink {
	tfile: TFile;
	index: number;
	matchText: string;
	wikiInner: string;
}

export interface ParsedWikilink {
	linkPath: string;
	section: string | null;
	alias: string | null;
}

export interface WikilinkMatch {
	index: number;
	matchText: string;
	inner: string;
}

// === Periodic Notes ===

export interface NoteInfo {
	type: 'daily' | 'weekly' | 'monthly' | 'yearly';
	year: number;
	month?: number;
	day?: number;
	week?: number;
}

// === Plugin Settings ===

/**
 * Plugin settings that are user-configurable via the settings tab.
 *
 * Note patterns use moment.js format tokens:
 * @see https://momentjs.com/docs/#/displaying/format/
 *
 * Common tokens:
 * - YYYY - 4-digit year
 * - MM - 2-digit month (01-12)
 * - DD - 2-digit day (01-31)
 * - ddd - 3-letter weekday (Mon, Tue, etc.)
 * - MMM - 3-letter month (Jan, Feb, etc.)
 * - WW - ISO week number (01-53)
 * - gggg - ISO week-numbering year
 * - [text] - Literal text (escaped)
 */
export interface BulletFlowSettings {
	/** Base folder for periodic notes (e.g., '+Diary') */
	diaryFolder: string;

	/** Target section heading with level (e.g., '## Log', '### Inbox') */
	targetSectionHeading: string;

	/** Daily note path pattern using moment.js format (e.g., 'YYYY/MM/YYYY-MM-DD ddd') */
	dailyNotePattern: string;

	/** Weekly note path pattern using moment.js format (e.g., 'gggg/MM/gggg-MM-[W]WW') */
	weeklyNotePattern: string;

	/** Monthly note path pattern using moment.js format (e.g., 'YYYY/YYYY-MM MMM') */
	monthlyNotePattern: string;

	/** Yearly note path pattern using moment.js format (e.g., 'YYYY/YYYY') */
	yearlyNotePattern: string;
}

export const DEFAULT_SETTINGS: BulletFlowSettings = {
	diaryFolder: '+Diary',
	targetSectionHeading: '## Log',
	dailyNotePattern: 'YYYY/MM/YYYY-MM-DD ddd',
	weeklyNotePattern: 'gggg/MM/gggg-MM-[W]WW',
	monthlyNotePattern: 'YYYY/YYYY-MM MMM',
	yearlyNotePattern: 'YYYY/YYYY'
};

// === Command Results ===

/**
 * Base result type for all commands.
 */
export interface CommandResult {
	success: boolean;
	message: string;
}

/**
 * Result of task migration operations (migrateTask, pushTaskDown, pullUp).
 */
export interface TaskTransferResult extends CommandResult {
	tasksProcessed: number;
	tasksMerged: number;
	tasksNew: number;
}

/**
 * Result of extract log operation.
 */
export interface ExtractLogResult extends CommandResult {
	targetNoteName: string;
	targetSection: string;
}

/**
 * Create a success result for task transfer operations.
 */
export function createTaskTransferResult(
	commandName: string,
	processed: number,
	merged: number,
	isNew: number
): TaskTransferResult {
	let message: string;
	if (processed === 0) {
		message = `${commandName}: No tasks processed.`;
	} else if (processed === 1) {
		message = merged > 0
			? `${commandName}: Task merged with existing.`
			: `${commandName}: Task transferred successfully.`;
	} else {
		const parts: string[] = [];
		if (isNew > 0) parts.push(`${isNew} new`);
		if (merged > 0) parts.push(`${merged} merged`);
		message = `${commandName}: ${processed} tasks transferred (${parts.join(', ')}).`;
	}
	return {
		success: true,
		message,
		tasksProcessed: processed,
		tasksMerged: merged,
		tasksNew: isNew
	};
}

/**
 * Create an error result.
 */
export function createErrorResult(commandName: string, error: string): CommandResult {
	return {
		success: false,
		message: `${commandName} ERROR: ${error}`
	};
}

/**
 * Create a validation failure result (not an error, just can't proceed).
 */
export function createValidationResult(commandName: string, reason: string): CommandResult {
	return {
		success: false,
		message: `${commandName}: ${reason}`
	};
}
