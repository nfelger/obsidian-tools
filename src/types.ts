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

export interface ParsedWikilink {
	linkPath: string;
	section: string | null;
	alias: string | null;
}

// === Periodic Notes ===

export interface NoteInfo {
	type: 'daily' | 'weekly' | 'monthly' | 'yearly';
	year: number;
	month?: number;
	day?: number;
	week?: number;
}

/**
 * Where one periodic note granularity lives: vault folder plus a moment.js
 * filename format (which may contain `/` for nested subfolders).
 */
export interface PeriodPathConfig {
	folder: string;
	format: string;
}

/**
 * Folder/format configuration for all four granularities.
 *
 * Resolved at command time from the Daily Notes / Periodic Notes plugins via
 * `getPeriodicConfig()` — Bullet Flow no longer keeps its own copy of these
 * settings. The defaults below apply when those plugins aren't available.
 */
export interface PeriodicConfig {
	daily: PeriodPathConfig;
	weekly: PeriodPathConfig;
	monthly: PeriodPathConfig;
	yearly: PeriodPathConfig;
}

export const DEFAULT_PERIODIC_CONFIG: PeriodicConfig = {
	daily: { folder: '+Diary', format: 'YYYY/MM/YYYY-MM-DD ddd' },
	weekly: { folder: '+Diary', format: 'gggg/MM/gggg-MM-[W]WW' },
	monthly: { folder: '+Diary', format: 'YYYY/YYYY-MM MMM' },
	yearly: { folder: '+Diary', format: 'YYYY/YYYY' }
};

// === Plugin Settings ===

/**
 * Plugin settings that are user-configurable via the settings tab.
 *
 * Periodic note locations (folder and filename format) are NOT part of these
 * settings — they are resolved from the Daily Notes / Periodic Notes plugins
 * at command time (see PeriodicConfig and getPeriodicConfig).
 */
export interface BulletFlowSettings {
	/** Schema version of saved settings; bump when defaults change meaning */
	settingsVersion: number;

	/** Target section heading in periodic notes (e.g., '## Log', '### Inbox') */
	periodicNoteTaskTargetHeading: string;

	/** Target section heading for Extract Log (e.g., '## Log') */
	logExtractionTargetHeading: string;

	/** Target section heading in project notes (e.g., '## Todo') */
	projectNoteTaskTargetHeading: string;

	/** Folder containing project notes (e.g., '1 Projekte') */
	projectsFolder: string;

	/** Keywords that identify collector tasks in daily notes (e.g., '"Push", "Finish"') */
	projectKeywords: string;

	/** Section heading in daily notes where completed tasks are moved to (e.g., '## Log') */
	dailyNoteLogHeading: string;

	/** Folder where finished projects are moved to (e.g., '4 Archive') */
	projectArchiveFolder: string;
}

export const SETTINGS_VERSION = 2;

export const DEFAULT_SETTINGS: BulletFlowSettings = {
	settingsVersion: SETTINGS_VERSION,
	periodicNoteTaskTargetHeading: '## Todo',
	logExtractionTargetHeading: '## Log',
	projectNoteTaskTargetHeading: '## Todo',
	projectsFolder: '1 Projekte',
	projectKeywords: '"Push", "Finish"',
	dailyNoteLogHeading: '## Log',
	projectArchiveFolder: '4 Archive'
};

/**
 * Migrate saved settings from older plugin versions.
 *
 * - Unversioned (pre-0.11.1): `## Log` was the default task target heading;
 *   a saved `## Log` is treated as that old default and updated to `## Todo`.
 * - Version < 2: filename pattern settings (diary folder, per-granularity
 *   patterns) moved out of Bullet Flow — they are now read from the Daily
 *   Notes / Periodic Notes plugins, so stored copies are dropped.
 *
 * @param data - Raw data from loadData(), or null on fresh installs
 * @returns Migrated data (same object shape), or null if data was null
 */
export function migrateSettings(
	data: (Partial<BulletFlowSettings> & Record<string, unknown>) | null
): Partial<BulletFlowSettings> | null {
	if (!data) return null;

	if (data.settingsVersion === undefined) {
		if (data.periodicNoteTaskTargetHeading === '## Log') {
			data.periodicNoteTaskTargetHeading = '## Todo';
		}
	}

	if ((data.settingsVersion as number ?? 0) < 2) {
		delete data.diaryFolder;
		delete data.dailyNotePattern;
		delete data.weeklyNotePattern;
		delete data.monthlyNotePattern;
		delete data.yearlyNotePattern;
		data.settingsVersion = SETTINGS_VERSION;
	}

	return data;
}

// === Task Insertion ===

/**
 * Data for a task to be inserted into a target note.
 */
export interface TaskInsertItem {
	taskText: string;
	taskContent: string;
	childrenContent: string;
}

// === Task Matching ===

/**
 * Lifecycle classification of a task found by text search.
 */
export type TaskMatchState = 'open' | 'scheduled' | 'completed';

/**
 * A task found by text search, with its file-absolute line and state.
 */
export interface TaskMatch {
	lineNumber: number;
	state: TaskMatchState;
}

