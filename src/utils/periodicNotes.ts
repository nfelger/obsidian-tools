/**
 * Utilities for working with periodic notes (daily, weekly, monthly, yearly).
 */

import type { NoteInfo, BulletFlowSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// === Pattern Token Handling ===

/**
 * Token definitions for pattern parsing and generation.
 */
const TOKEN_REGEX: Record<string, string> = {
	'{year}': '(\\d{4})',
	'{month}': '(\\d{2})',
	'{day}': '(\\d{2})',
	'{week}': '(\\d{2})',
	'{weekday}': '([A-Z][a-z]{2})',
	'{monthName}': '([A-Z][a-z]{2})'
};

/**
 * Convert a pattern to a regex for matching filenames.
 * Returns the regex and an array of token names in capture group order.
 *
 * @param pattern - Pattern with tokens like {year}, {month}, etc.
 * @returns Object with regex and ordered token names
 */
export function patternToRegex(pattern: string): { regex: RegExp; tokens: string[] } {
	// Get filename portion (after last /)
	const lastSlash = pattern.lastIndexOf('/');
	const filenamePart = lastSlash >= 0 ? pattern.slice(lastSlash + 1) : pattern;

	const tokens: string[] = [];
	let regexStr = filenamePart;

	// Escape regex special characters except our tokens
	regexStr = regexStr.replace(/[.*+?^${}()|[\]\\]/g, (match) => {
		// Don't escape our token braces
		if (match === '{' || match === '}') return match;
		return '\\' + match;
	});

	// Replace tokens with regex groups and track order
	for (const [token, regex] of Object.entries(TOKEN_REGEX)) {
		const tokenPattern = token.replace(/[{}]/g, '\\$&');
		const re = new RegExp(tokenPattern, 'g');
		let match;
		while ((match = re.exec(regexStr)) !== null) {
			tokens.push(token);
		}
		regexStr = regexStr.replace(re, regex);
	}

	return { regex: new RegExp(`^${regexStr}$`), tokens };
}

/**
 * Extract values from a filename using a pattern.
 *
 * @param filename - The filename to parse
 * @param pattern - The pattern to match against
 * @returns Object with extracted values or null if no match
 */
export function extractFromPattern(
	filename: string,
	pattern: string
): Record<string, number | string> | null {
	const { regex, tokens } = patternToRegex(pattern);
	const match = filename.match(regex);

	if (!match) return null;

	const result: Record<string, number | string> = {};
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		const value = match[i + 1];

		// Parse numeric tokens
		if (token === '{year}' || token === '{month}' || token === '{day}' || token === '{week}') {
			result[token] = parseInt(value, 10);
		} else {
			result[token] = value;
		}
	}

	return result;
}

/**
 * Substitute tokens in a pattern with actual values.
 *
 * @param pattern - Pattern with tokens
 * @param values - Values to substitute
 * @returns Pattern with values substituted
 */
export function substitutePattern(pattern: string, values: Record<string, string | number>): string {
	let result = pattern;
	for (const [token, value] of Object.entries(values)) {
		result = result.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), String(value));
	}
	return result;
}

/**
 * Pad a number to 2 digits.
 */
function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

// === Note Type Detection ===

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
): 'daily' | 'weekly' | 'monthly' | 'yearly' | null {
	// Check each pattern - order matters for disambiguation
	// Yearly is most specific (only year), so check it last
	const patterns: Array<{ type: 'daily' | 'weekly' | 'monthly' | 'yearly'; pattern: string }> = [
		{ type: 'daily', pattern: settings.dailyNotePattern },
		{ type: 'weekly', pattern: settings.weeklyNotePattern },
		{ type: 'monthly', pattern: settings.monthlyNotePattern },
		{ type: 'yearly', pattern: settings.yearlyNotePattern }
	];

	for (const { type, pattern } of patterns) {
		const extracted = extractFromPattern(filename, pattern);
		if (extracted) {
			return type;
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

	const type = detectNoteType(filename, settings);
	if (!type) return null;

	const pattern = {
		daily: settings.dailyNotePattern,
		weekly: settings.weeklyNotePattern,
		monthly: settings.monthlyNotePattern,
		yearly: settings.yearlyNotePattern
	}[type];

	const extracted = extractFromPattern(filename, pattern);
	if (!extracted) return null;

	const year = extracted['{year}'] as number;

	switch (type) {
		case 'daily':
			return {
				type: 'daily',
				year,
				month: extracted['{month}'] as number,
				day: extracted['{day}'] as number
			};

		case 'weekly':
			return {
				type: 'weekly',
				year,
				month: extracted['{month}'] as number,
				week: extracted['{week}'] as number
			};

		case 'monthly':
			return {
				type: 'monthly',
				year,
				month: extracted['{month}'] as number
			};

		case 'yearly':
			return {
				type: 'yearly',
				year
			};

		default:
			return null;
	}
}

// === Date Utilities ===

/**
 * Get weekday abbreviation for a date
 */
export function getWeekdayAbbrev(date: Date): string {
	return WEEKDAY_NAMES[date.getDay()];
}

/**
 * Get month abbreviation (1-indexed: 1=Jan, 12=Dec)
 */
export function getMonthAbbrev(month: number): string {
	return MONTH_NAMES[month - 1];
}

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
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Get the Monday of a given ISO week.
 */
export function getMondayOfISOWeek(year: number, week: number): Date {
	const jan4 = new Date(year, 0, 4);
	const dayOfWeek = jan4.getDay() || 7;
	const mondayOfWeek1 = new Date(jan4);
	mondayOfWeek1.setDate(jan4.getDate() - dayOfWeek + 1);

	const targetMonday = new Date(mondayOfWeek1);
	targetMonday.setDate(mondayOfWeek1.getDate() + (week - 1) * 7);
	return targetMonday;
}

// === Path Generation ===

/**
 * Normalize settings input - accepts either a BulletFlowSettings object or a diary folder string.
 */
function normalizeSettings(settingsOrFolder?: BulletFlowSettings | string): BulletFlowSettings {
	if (!settingsOrFolder) {
		return DEFAULT_SETTINGS;
	}
	if (typeof settingsOrFolder === 'string') {
		return { ...DEFAULT_SETTINGS, diaryFolder: settingsOrFolder };
	}
	return settingsOrFolder;
}

/**
 * Format a date as a daily note path using the pattern.
 */
export function formatDailyPath(
	date: Date,
	settingsOrFolder: BulletFlowSettings | string = DEFAULT_SETTINGS
): string {
	const settings = normalizeSettings(settingsOrFolder);
	const values: Record<string, string | number> = {
		'{year}': date.getFullYear(),
		'{month}': pad2(date.getMonth() + 1),
		'{day}': pad2(date.getDate()),
		'{weekday}': getWeekdayAbbrev(date),
		'{monthName}': getMonthAbbrev(date.getMonth() + 1)
	};

	const path = substitutePattern(settings.dailyNotePattern, values);
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
	const values: Record<string, string | number> = {
		'{year}': date.getFullYear(),
		'{month}': pad2(date.getMonth() + 1),
		'{week}': pad2(week),
		'{monthName}': getMonthAbbrev(date.getMonth() + 1)
	};

	const path = substitutePattern(settings.weeklyNotePattern, values);
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
	const values: Record<string, string | number> = {
		'{year}': year,
		'{month}': pad2(month),
		'{monthName}': getMonthAbbrev(month)
	};

	const path = substitutePattern(settings.monthlyNotePattern, values);
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
	const values: Record<string, string | number> = {
		'{year}': year
	};

	const path = substitutePattern(settings.yearlyNotePattern, values);
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
