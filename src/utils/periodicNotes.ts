/**
 * Utilities for working with periodic notes (daily, weekly, monthly, yearly).
 *
 * Uses moment.js for date parsing and formatting.
 * @see https://momentjs.com/docs/#/displaying/format/
 */

import { moment } from 'obsidian';
import type { NoteInfo, PeriodicConfig } from '../types';
import { DEFAULT_PERIODIC_CONFIG } from '../types';

// === Pattern Utilities ===

/**
 * Extract the filename portion from a format (after the last /).
 * Formats may contain slashes for nested subfolders.
 */
function getFilenamePattern(pattern: string): string {
	const lastSlash = pattern.lastIndexOf('/');
	return lastSlash >= 0 ? pattern.slice(lastSlash + 1) : pattern;
}

/**
 * Join a folder and a formatted relative path; folder may be '' (vault root).
 */
function joinPath(folder: string, rel: string): string {
	return folder ? `${folder}/${rel}` : rel;
}

/**
 * Whether the weekly format counts weeks in the locale system (`ww`/`w`,
 * e.g. Sunday-start weeks) instead of ISO weeks (`WW`/`W`, Monday-start).
 *
 * The week numbering of the vault follows from this token: all week math
 * (week → month, next week, period checks) must use the same system.
 */
export function usesLocaleWeeks(config: PeriodicConfig): boolean {
	const tokens = config.weekly.format.replace(/\[[^\]]*\]/g, '');
	return /w/.test(tokens);
}

// === Periodic Note Service ===

/**
 * Service for periodic note operations with an encapsulated folder/format
 * configuration (resolved from the Daily Notes / Periodic Notes plugins).
 */
export class PeriodicNoteService {
	constructor(private readonly config: PeriodicConfig) {}

	/**
	 * Parse a periodic note filename to determine its type and date info.
	 */
	parseNoteType(filename: string): NoteInfo | null {
		return parseNoteType(filename, this.config);
	}

	/**
	 * Calculate the path to the next periodic note.
	 */
	getNextNotePath(noteInfo: NoteInfo): string {
		return getNextNotePath(noteInfo, this.config);
	}

	/**
	 * Get the path to the higher-level periodic note.
	 */
	getHigherNotePath(noteInfo: NoteInfo): string | null {
		return getHigherNotePath(noteInfo, this.config);
	}

	/**
	 * Get the path to the lower-level periodic note for the current date.
	 */
	getLowerNotePath(noteInfo: NoteInfo, today: Date): string | null {
		return getLowerNotePath(noteInfo, today, this.config);
	}

	/**
	 * Check if a date falls within a periodic note's range.
	 */
	dateIsInPeriod(date: Date, noteInfo: NoteInfo): boolean {
		return dateIsInPeriod(date, noteInfo, this.config);
	}

	/**
	 * Format a date as a daily note path.
	 */
	formatDailyPath(date: Date): string {
		return formatDailyPath(date, this.config);
	}
}

// === Note Type Detection ===

interface ParseResult {
	parsed: ReturnType<typeof moment>;
	extractedWeek?: number;
}

/**
 * Try to parse a filename with a moment format pattern.
 * Returns the parsed moment and any extracted week number.
 *
 * Note: moment's strict parsing doesn't extract week numbers from literal text
 * like "W04", so we handle that separately.
 */
function tryParseWithFormat(filename: string, format: string): ParseResult | null {
	const filenameFormat = getFilenamePattern(format);

	// Handle weekly patterns with [W]WW / [W]ww - extract the week number
	// manually, since moment ignores week tokens when month/day tokens are
	// also present (it would silently parse to the 1st of the month)
	let extractedWeek: number | undefined;
	let adjustedFilename = filename;
	let adjustedFormat = filenameFormat;

	const weekToken = filenameFormat.match(/\[W\](W{1,2}|w{1,2})/);
	if (weekToken) {
		const weekMatch = filename.match(/W(\d{1,2})/);
		if (weekMatch) {
			extractedWeek = parseInt(weekMatch[1], 10);
			// Replace W## with placeholder for parsing
			adjustedFilename = filename.replace(/W\d{1,2}/, 'W00');
			adjustedFormat = filenameFormat.replace(weekToken[0], '[W00]');
		} else {
			return null; // Pattern expects W## but none found
		}
	}

	const parsed = moment(adjustedFilename, adjustedFormat, true);
	if (!parsed.isValid()) return null;

	return { parsed, extractedWeek };
}

/**
 * Determine what type of note a filename represents.
 *
 * @param filename - The note's basename (without .md extension)
 * @param config - Periodic note folder/format configuration
 * @returns Type of note or null if not recognized
 */
function detectNoteType(
	filename: string,
	config: PeriodicConfig
): { type: 'daily' | 'weekly' | 'monthly' | 'yearly'; result: ParseResult } | null {
	// Check each pattern - order matters for disambiguation
	// Check more specific patterns first (daily has most tokens)
	const patterns: Array<{ type: 'daily' | 'weekly' | 'monthly' | 'yearly'; pattern: string }> = [
		{ type: 'daily', pattern: config.daily.format },
		{ type: 'weekly', pattern: config.weekly.format },
		{ type: 'monthly', pattern: config.monthly.format },
		{ type: 'yearly', pattern: config.yearly.format }
	];

	for (const { type, pattern } of patterns) {
		const result = tryParseWithFormat(filename, pattern);
		if (result) {
			return { type, result };
		}
	}

	return null;
}

/**
 * Parse a periodic note filename to determine its type and date info.
 *
 * @param filename - The note's basename (without .md extension)
 * @param config - Periodic note folder/format configuration
 * @returns NoteInfo or null if not a recognized periodic note
 */
export function parseNoteType(
	filename: string,
	config: PeriodicConfig = DEFAULT_PERIODIC_CONFIG
): NoteInfo | null {
	if (!filename) return null;

	const detected = detectNoteType(filename, config);
	if (!detected) return null;

	const { type, result } = detected;
	const { parsed, extractedWeek } = result;

	switch (type) {
		case 'daily':
			return {
				type: 'daily',
				year: parsed.year(),
				month: parsed.month() + 1, // moment months are 0-indexed
				day: parsed.date()
			};

		case 'weekly':
			return {
				type: 'weekly',
				year: parsed.year(), // Use year from the date portion
				month: parsed.month() + 1,
				week: extractedWeek ?? (usesLocaleWeeks(config) ? parsed.week() : parsed.isoWeek())
			};

		case 'monthly':
			return {
				type: 'monthly',
				year: parsed.year(),
				month: parsed.month() + 1
			};

		case 'yearly':
			return {
				type: 'yearly',
				year: parsed.year()
			};

		default:
			return null;
	}
}

// === Date Utilities ===

/**
 * Check if a date is Sunday (last day of week, since week starts Monday)
 */
export function isLastDayOfWeek(date: Date): boolean {
	return date.getDay() === 0;
}

/**
 * Check if a month is December
 */
export function isDecember(month: number): boolean {
	return month === 12;
}

/**
 * Get ISO week number for a date.
 * ISO weeks start on Monday and the first week contains Jan 4th.
 */
export function getISOWeekNumber(date: Date): number {
	return moment(date).isoWeek();
}

/**
 * Get the Monday of a given ISO week.
 */
export function getMondayOfISOWeek(year: number, week: number): Date {
	return moment().isoWeekYear(year).isoWeek(week).startOf('isoWeek').toDate();
}

// === Path Generation ===

/**
 * Format a date as a daily note path using the pattern.
 */
export function formatDailyPath(
	date: Date,
	config: PeriodicConfig = DEFAULT_PERIODIC_CONFIG
): string {
	return joinPath(config.daily.folder, moment(date).format(config.daily.format));
}

/**
 * Format a weekly note path using the pattern.
 */
function formatWeeklyPath(
	date: Date,
	week: number,
	config: PeriodicConfig = DEFAULT_PERIODIC_CONFIG
): string {
	// Use the date but ensure the week is set in the vault's week system
	const m = usesLocaleWeeks(config) ? moment(date).week(week) : moment(date).isoWeek(week);
	return joinPath(config.weekly.folder, m.format(config.weekly.format));
}

/**
 * Format a monthly note path using the pattern.
 */
function formatMonthlyPath(
	year: number,
	month: number,
	config: PeriodicConfig = DEFAULT_PERIODIC_CONFIG
): string {
	const m = moment().year(year).month(month - 1).date(1);
	return joinPath(config.monthly.folder, m.format(config.monthly.format));
}

/**
 * Format a yearly note path using the pattern.
 */
function formatYearlyPath(
	year: number,
	config: PeriodicConfig = DEFAULT_PERIODIC_CONFIG
): string {
	const m = moment().year(year).month(0).date(1);
	return joinPath(config.yearly.folder, m.format(config.yearly.format));
}

/**
 * Check if a date falls within a periodic note's range.
 *
 * @param date - The date to check
 * @param noteInfo - The note info to check against
 * @returns true if the date is within the note's period
 */
export function dateIsInPeriod(
	date: Date,
	noteInfo: NoteInfo,
	config: PeriodicConfig = DEFAULT_PERIODIC_CONFIG
): boolean {
	const { type, year, month, day, week } = noteInfo;

	switch (type) {
		case 'daily':
			return (
				date.getFullYear() === year &&
				date.getMonth() + 1 === month &&
				date.getDate() === day
			);

		case 'weekly': {
			if (week === undefined) return false;
			const m = moment(date);
			if (usesLocaleWeeks(config)) {
				const noteWeekYear = moment().weekYear(year).week(week).weekYear();
				return m.week() === week && m.weekYear() === noteWeekYear;
			}
			// The year in noteInfo is the display year, but for comparison
			// we need to use the ISO week year
			const noteWeekYear = moment()
				.isoWeekYear(year)
				.isoWeek(week)
				.isoWeekYear();
			return m.isoWeek() === week && m.isoWeekYear() === noteWeekYear;
		}

		case 'monthly':
			return date.getFullYear() === year && date.getMonth() + 1 === month;

		case 'yearly':
			return date.getFullYear() === year;

		default:
			return false;
	}
}

/**
 * Get the path to the lower-level periodic note for the current date.
 *
 * @param noteInfo - The current note's info
 * @param today - The current date
 * @param config - Periodic note folder/format configuration
 * @returns Path to target note, or null if at lowest level (daily)
 * @throws Error if source period doesn't contain today
 */
export function getLowerNotePath(
	noteInfo: NoteInfo,
	today: Date,
	config: PeriodicConfig = DEFAULT_PERIODIC_CONFIG
): string | null {
	// Validate that today is within the source period
	if (!dateIsInPeriod(today, noteInfo)) {
		throw new Error('Current date is not within the source period');
	}

	switch (noteInfo.type) {
		case 'yearly':
			// Yearly → current month
			return formatMonthlyPath(today.getFullYear(), today.getMonth() + 1, config);

		case 'monthly':
			// Monthly → current week (in the vault's week system)
			const week = usesLocaleWeeks(config) ? moment(today).week() : getISOWeekNumber(today);
			return formatWeeklyPath(today, week, config);

		case 'weekly':
			// Weekly → current day
			return formatDailyPath(today, config);

		case 'daily':
			// Already at lowest level
			return null;

		default:
			return null;
	}
}

/**
 * Get the path to the higher-level periodic note.
 *
 * Hierarchy:
 * - Daily → Weekly (week containing that day)
 * - Weekly → Monthly (month containing Thursday of that week)
 * - Monthly → Yearly
 * - Yearly → null (already at highest)
 *
 * @param noteInfo - The current note's info
 * @param config - Periodic note folder/format configuration
 * @returns Path to target note, or null if at highest level (yearly)
 */
export function getHigherNotePath(
	noteInfo: NoteInfo,
	config: PeriodicConfig = DEFAULT_PERIODIC_CONFIG
): string | null {
	switch (noteInfo.type) {
		case 'daily': {
			// Daily → Weekly (week containing that day)
			const { year, month, day } = noteInfo;
			if (year === undefined || month === undefined || day === undefined) {
				return null;
			}
			const date = new Date(year, month - 1, day);
			const m = moment(date);
			// Get Thursday of this week (determines ISO week year and month)
			const thursday = m.clone().isoWeekday(4);
			// Format using the weekly format directly - moment handles week 53 correctly
			return joinPath(config.weekly.folder, thursday.format(config.weekly.format));
		}

		case 'weekly': {
			// Weekly → Monthly. ISO weeks belong to the month of their
			// Thursday; locale weeks to the month of their first day (which
			// is also how their notes are named).
			const { year, week } = noteInfo;
			if (year === undefined || week === undefined) {
				return null;
			}
			const ref = usesLocaleWeeks(config)
				? moment().weekYear(year).week(week).weekday(0)
				: moment().isoWeekYear(year).isoWeek(week).isoWeekday(4);
			return formatMonthlyPath(ref.year(), ref.month() + 1, config);
		}

		case 'monthly': {
			// Monthly → Yearly
			const { year } = noteInfo;
			if (year === undefined) {
				return null;
			}
			return formatYearlyPath(year, config);
		}

		case 'yearly':
			// Already at highest level
			return null;

		default:
			return null;
	}
}

export function getNextNotePath(
	noteInfo: NoteInfo,
	config: PeriodicConfig = DEFAULT_PERIODIC_CONFIG
): string {
	const { type, year, month, day, week } = noteInfo;

	switch (type) {
		case 'daily': {
			if (year === undefined || month === undefined || day === undefined) {
				return '';
			}
			const date = new Date(year, month - 1, day);
			const localeWeeks = usesLocaleWeeks(config);
			const lastDayOfWeek = localeWeeks ? date.getDay() === 6 : isLastDayOfWeek(date);
			const nextDate = new Date(year, month - 1, day + 1);
			if (lastDayOfWeek) {
				// Last day of the week → next weekly note
				if (localeWeeks) {
					// nextDate is the first day of the next locale week —
					// formatting it directly renders all tokens consistently
					return joinPath(config.weekly.folder, moment(nextDate).format(config.weekly.format));
				}
				const nextWeek = getISOWeekNumber(nextDate);
				// Use Thursday to determine the month for the weekly note path
				const thursdayOfNextWeek = new Date(nextDate);
				thursdayOfNextWeek.setDate(thursdayOfNextWeek.getDate() + 3);
				return formatWeeklyPath(thursdayOfNextWeek, nextWeek, config);
			} else {
				// Normal case → next daily note
				return formatDailyPath(nextDate, config);
			}
		}

		case 'weekly': {
			if (year === undefined || week === undefined) {
				return '';
			}
			if (usesLocaleWeeks(config)) {
				const startOfNextWeek = moment().weekYear(year).week(week).weekday(0).add(7, 'days');
				return joinPath(config.weekly.folder, startOfNextWeek.format(config.weekly.format));
			}
			const mondayOfCurrentWeek = getMondayOfISOWeek(year, week);
			const mondayOfNextWeek = new Date(mondayOfCurrentWeek);
			mondayOfNextWeek.setDate(mondayOfNextWeek.getDate() + 7);

			// Use Thursday to determine ISO year and month
			const thursdayOfNextWeek = new Date(mondayOfNextWeek);
			thursdayOfNextWeek.setDate(thursdayOfNextWeek.getDate() + 3);

			const nextWeek = getISOWeekNumber(mondayOfNextWeek);
			return formatWeeklyPath(thursdayOfNextWeek, nextWeek, config);
		}

		case 'monthly': {
			if (year === undefined || month === undefined) {
				return '';
			}
			if (isDecember(month)) {
				// December → next yearly note
				return formatYearlyPath(year + 1, config);
			} else {
				// Normal case → next monthly note
				return formatMonthlyPath(year, month + 1, config);
			}
		}

		case 'yearly': {
			if (year === undefined) {
				return '';
			}
			return formatYearlyPath(year + 1, config);
		}

		default:
			return '';
	}
}
