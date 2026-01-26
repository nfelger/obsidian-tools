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
