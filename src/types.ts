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
 * Pattern tokens:
 * - {year} - 4-digit year (e.g., 2026)
 * - {month} - 2-digit month, zero-padded (e.g., 01)
 * - {day} - 2-digit day, zero-padded (e.g., 22)
 * - {weekday} - 3-letter weekday abbreviation (e.g., Mon, Tue)
 * - {monthName} - 3-letter month abbreviation (e.g., Jan, Feb)
 * - {week} - 2-digit ISO week number, zero-padded (e.g., 04)
 */
export interface BulletFlowSettings {
	/** Base folder for periodic notes (e.g., '+Diary') */
	diaryFolder: string;

	/** Log section heading with level (e.g., '## Log', '### Inbox') */
	logSectionHeading: string;

	/** Daily note path pattern (e.g., '{year}/{month}/{year}-{month}-{day} {weekday}') */
	dailyNotePattern: string;

	/** Weekly note path pattern (e.g., '{year}/{month}/{year}-{month}-W{week}') */
	weeklyNotePattern: string;

	/** Monthly note path pattern (e.g., '{year}/{year}-{month} {monthName}') */
	monthlyNotePattern: string;

	/** Yearly note path pattern (e.g., '{year}/{year}') */
	yearlyNotePattern: string;
}

export const DEFAULT_SETTINGS: BulletFlowSettings = {
	diaryFolder: '+Diary',
	logSectionHeading: '## Log',
	dailyNotePattern: '{year}/{month}/{year}-{month}-{day} {weekday}',
	weeklyNotePattern: '{year}/{month}/{year}-{month}-W{week}',
	monthlyNotePattern: '{year}/{year}-{month} {monthName}',
	yearlyNotePattern: '{year}/{year}'
};
