/**
 * Utilities for working with periodic notes (daily, weekly, monthly, yearly).
 *
 * Uses moment.js for date parsing and formatting.
 * @see https://momentjs.com/docs/#/displaying/format/
 */

import { moment } from 'obsidian';
import type { NoteInfo, BulletFlowSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

// === Pattern Utilities ===

/**
 * Extract the filename portion from a pattern (after the last /).
 */
function getFilenamePattern(pattern: string): string {
	const lastSlash = pattern.lastIndexOf('/');
	return lastSlash >= 0 ? pattern.slice(lastSlash + 1) : pattern;
}

/**
 * Normalize settings input - accepts either a BulletFlowSettings object or a diary folder string.
 * Merges with defaults to ensure all properties are present.
 */
function normalizeSettings(settingsOrFolder?: Partial<BulletFlowSettings> | string): BulletFlowSettings {
	if (!settingsOrFolder) {
		return DEFAULT_SETTINGS;
	}
	if (typeof settingsOrFolder === 'string') {
		return { ...DEFAULT_SETTINGS, diaryFolder: settingsOrFolder };
	}
	return { ...DEFAULT_SETTINGS, ...settingsOrFolder };
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

	// Handle weekly patterns with [W]WW - extract week number manually
	// since moment doesn't parse the week from literal text correctly
	let extractedWeek: number | undefined;
	let adjustedFilename = filename;
	let adjustedFormat = filenameFormat;

	if (filenameFormat.includes('[W]WW')) {
		const weekMatch = filename.match(/W(\d{2})/);
		if (weekMatch) {
			extractedWeek = parseInt(weekMatch[1], 10);
			// Replace W## with placeholder for parsing
			adjustedFilename = filename.replace(/W\d{2}/, 'W00');
			adjustedFormat = filenameFormat.replace('[W]WW', '[W00]');
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
 * @param settings - Plugin settings with patterns
 * @returns Type of note or null if not recognized
 */
function detectNoteType(
	filename: string,
	settings: BulletFlowSettings
): { type: 'daily' | 'weekly' | 'monthly' | 'yearly'; result: ParseResult } | null {
	// Check each pattern - order matters for disambiguation
	// Check more specific patterns first (daily has most tokens)
	const patterns: Array<{ type: 'daily' | 'weekly' | 'monthly' | 'yearly'; pattern: string }> = [
		{ type: 'daily', pattern: settings.dailyNotePattern },
		{ type: 'weekly', pattern: settings.weeklyNotePattern },
		{ type: 'monthly', pattern: settings.monthlyNotePattern },
		{ type: 'yearly', pattern: settings.yearlyNotePattern }
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
 * @param settings - Plugin settings with patterns (optional, uses defaults)
 * @returns NoteInfo or null if not a recognized periodic note
 */
export function parseNoteType(
	filename: string,
	settings: BulletFlowSettings = DEFAULT_SETTINGS
): NoteInfo | null {
	if (!filename) return null;

	const detected = detectNoteType(filename, settings);
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
				week: extractedWeek ?? parsed.isoWeek()
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

/**
 * Get weekday abbreviation for a date
 */
export function getWeekdayAbbrev(date: Date): string {
	return moment(date).format('ddd');
}

/**
 * Get month abbreviation (1-indexed: 1=Jan, 12=Dec)
 */
export function getMonthAbbrev(month: number): string {
	return moment().month(month - 1).format('MMM');
}

// === Path Generation ===

/**
 * Format a date as a daily note path using the pattern.
 */
export function formatDailyPath(
	date: Date,
	settingsOrFolder: BulletFlowSettings | string = DEFAULT_SETTINGS
): string {
	const settings = normalizeSettings(settingsOrFolder);
	const path = moment(date).format(settings.dailyNotePattern);
	return `${settings.diaryFolder}/${path}`;
}

/**
 * Format a weekly note path using the pattern.
 */
export function formatWeeklyPath(
	date: Date,
	week: number,
	settingsOrFolder: BulletFlowSettings | string = DEFAULT_SETTINGS
): string {
	const settings = normalizeSettings(settingsOrFolder);
	// Use the date but ensure the ISO week is set correctly
	const m = moment(date).isoWeek(week);
	const path = m.format(settings.weeklyNotePattern);
	return `${settings.diaryFolder}/${path}`;
}

/**
 * Format a monthly note path using the pattern.
 */
export function formatMonthlyPath(
	year: number,
	month: number,
	settingsOrFolder: BulletFlowSettings | string = DEFAULT_SETTINGS
): string {
	const settings = normalizeSettings(settingsOrFolder);
	const m = moment().year(year).month(month - 1).date(1);
	const path = m.format(settings.monthlyNotePattern);
	return `${settings.diaryFolder}/${path}`;
}

/**
 * Format a yearly note path using the pattern.
 */
export function formatYearlyPath(
	year: number,
	settingsOrFolder: BulletFlowSettings | string = DEFAULT_SETTINGS
): string {
	const settings = normalizeSettings(settingsOrFolder);
	const m = moment().year(year).month(0).date(1);
	const path = m.format(settings.yearlyNotePattern);
	return `${settings.diaryFolder}/${path}`;
}

/**
 * Calculate the path to the next periodic note.
 *
 * Boundary rules:
 * - Daily (Sunday) → next Weekly
 * - Weekly → always next Weekly
 * - Monthly (December) → next Yearly
 * - Yearly → always next Yearly
 *
 * @param noteInfo - Result from parseNoteType
 * @param settingsOrFolder - Plugin settings or diary folder string
 * @returns Full path to target note (without .md extension)
 */
/**
 * Check if a date falls within a periodic note's range.
 *
 * @param date - The date to check
 * @param noteInfo - The note info to check against
 * @returns true if the date is within the note's period
 */
export function dateIsInPeriod(date: Date, noteInfo: NoteInfo): boolean {
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
			// Get ISO week year - use moment for consistency
			const m = moment(date);
			const dateWeek = m.isoWeek();
			const dateWeekYear = m.isoWeekYear();
			// The year in noteInfo is the display year, but for comparison
			// we need to use the ISO week year
			const noteWeekYear = moment()
				.isoWeekYear(year)
				.isoWeek(week)
				.isoWeekYear();
			return dateWeek === week && dateWeekYear === noteWeekYear;
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
 * @param sourceNoteInfo - The current note's info
 * @param today - The current date
 * @param settingsOrFolder - Plugin settings or diary folder string
 * @returns Path to target note, or null if at lowest level (daily)
 * @throws Error if source period doesn't contain today
 */
export function getLowerNotePath(
	sourceNoteInfo: NoteInfo,
	today: Date,
	settingsOrFolder: BulletFlowSettings | string = DEFAULT_SETTINGS
): string | null {
	const settings = normalizeSettings(settingsOrFolder);

	// Validate that today is within the source period
	if (!dateIsInPeriod(today, sourceNoteInfo)) {
		throw new Error('Current date is not within the source period');
	}

	switch (sourceNoteInfo.type) {
		case 'yearly':
			// Yearly → current month
			return formatMonthlyPath(today.getFullYear(), today.getMonth() + 1, settings);

		case 'monthly':
			// Monthly → current week
			const week = getISOWeekNumber(today);
			return formatWeeklyPath(today, week, settings);

		case 'weekly':
			// Weekly → current day
			return formatDailyPath(today, settings);

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
 * @param sourceNoteInfo - The current note's info
 * @param settingsOrFolder - Plugin settings or diary folder string
 * @returns Path to target note, or null if at highest level (yearly)
 */
export function getHigherNotePath(
	sourceNoteInfo: NoteInfo,
	settingsOrFolder: BulletFlowSettings | string = DEFAULT_SETTINGS
): string | null {
	const settings = normalizeSettings(settingsOrFolder);

	switch (sourceNoteInfo.type) {
		case 'daily': {
			// Daily → Weekly (week containing that day)
			const { year, month, day } = sourceNoteInfo;
			if (year === undefined || month === undefined || day === undefined) {
				return null;
			}
			const date = new Date(year, month - 1, day);
			const m = moment(date);
			// Get Thursday of this week (determines ISO week year and month)
			const thursday = m.clone().isoWeekday(4);
			// Format using the weekly pattern directly - moment handles week 53 correctly
			const path = thursday.format(settings.weeklyNotePattern);
			return `${settings.diaryFolder}/${path}`;
		}

		case 'weekly': {
			// Weekly → Monthly (month containing Thursday of that week)
			const { year, week } = sourceNoteInfo;
			if (year === undefined || week === undefined) {
				return null;
			}
			// Use moment to get Thursday of this specific ISO week
			const thursday = moment().isoWeekYear(year).isoWeek(week).isoWeekday(4);
			return formatMonthlyPath(thursday.year(), thursday.month() + 1, settings);
		}

		case 'monthly': {
			// Monthly → Yearly
			const { year } = sourceNoteInfo;
			if (year === undefined) {
				return null;
			}
			return formatYearlyPath(year, settings);
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
	settingsOrFolder: BulletFlowSettings | string = DEFAULT_SETTINGS
): string {
	if (!noteInfo) return '';

	const settings = normalizeSettings(settingsOrFolder);
	const { type, year, month, day, week } = noteInfo;

	switch (type) {
		case 'daily': {
			if (year === undefined || month === undefined || day === undefined) {
				return '';
			}
			const date = new Date(year, month - 1, day);
			if (isLastDayOfWeek(date)) {
				// Sunday → next weekly note
				const nextDate = new Date(year, month - 1, day + 1);
				const nextWeek = getISOWeekNumber(nextDate);
				// Use Thursday to determine the month for the weekly note path
				const thursdayOfNextWeek = new Date(nextDate);
				thursdayOfNextWeek.setDate(thursdayOfNextWeek.getDate() + 3);
				return formatWeeklyPath(thursdayOfNextWeek, nextWeek, settings);
			} else {
				// Normal case → next daily note
				const nextDate = new Date(year, month - 1, day + 1);
				return formatDailyPath(nextDate, settings);
			}
		}

		case 'weekly': {
			if (year === undefined || week === undefined) {
				return '';
			}
			const mondayOfCurrentWeek = getMondayOfISOWeek(year, week);
			const mondayOfNextWeek = new Date(mondayOfCurrentWeek);
			mondayOfNextWeek.setDate(mondayOfNextWeek.getDate() + 7);

			// Use Thursday to determine ISO year and month
			const thursdayOfNextWeek = new Date(mondayOfNextWeek);
			thursdayOfNextWeek.setDate(thursdayOfNextWeek.getDate() + 3);

			const nextWeek = getISOWeekNumber(mondayOfNextWeek);
			return formatWeeklyPath(thursdayOfNextWeek, nextWeek, settings);
		}

		case 'monthly': {
			if (year === undefined || month === undefined) {
				return '';
			}
			if (isDecember(month)) {
				// December → next yearly note
				return formatYearlyPath(year + 1, settings);
			} else {
				// Normal case → next monthly note
				return formatMonthlyPath(year, month + 1, settings);
			}
		}

		case 'yearly': {
			if (year === undefined) {
				return '';
			}
			return formatYearlyPath(year + 1, settings);
		}

		default:
			return '';
	}
}
