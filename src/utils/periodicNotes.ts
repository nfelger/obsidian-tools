/**
 * Utilities for working with periodic notes (daily, weekly, monthly, yearly).
 *
 * MVP (Slice 5): Daily notes only, simple next-day migration
 * Full (Slice 6): All note types, boundary transitions
 */

const DIARY_FOLDER = '+Diary';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface NoteInfo {
	type: 'daily' | 'weekly' | 'monthly' | 'yearly';
	year: number;
	month?: number;
	day?: number;
	week?: number;
}

/**
 * Parse a periodic note filename to determine its type and date info.
 *
 * MVP: Supports daily notes only
 *
 * Filename formats (basename only, without path):
 * - Daily: "YYYY-MM-DD ddd" (e.g., "2026-01-22 Thu")
 *
 * @param filename - The note's basename (without .md extension)
 * @returns NoteInfo or null if not a recognized periodic note
 */
export function parseNoteType(filename: string): NoteInfo | null {
	if (!filename) return null;

	// Daily: "YYYY-MM-DD ddd" (e.g., "2026-01-22 Thu")
	const dailyMatch = filename.match(/^(\d{4})-(\d{2})-(\d{2}) [A-Z][a-z]{2}$/);
	if (dailyMatch) {
		return {
			type: 'daily',
			year: parseInt(dailyMatch[1], 10),
			month: parseInt(dailyMatch[2], 10),
			day: parseInt(dailyMatch[3], 10)
		};
	}

	// TODO (Slice 6): Add weekly, monthly, yearly patterns

	return null;
}

/**
 * Get weekday abbreviation for a date
 */
export function getWeekdayAbbrev(date: Date): string {
	return WEEKDAY_NAMES[date.getDay()];
}

/**
 * Format a date as a daily note path
 *
 * Format: "YYYY/MM/YYYY-MM-DD ddd" (e.g., "2026/01/2026-01-22 Thu")
 */
export function formatDailyPath(date: Date, diaryFolder: string = DIARY_FOLDER): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const weekday = getWeekdayAbbrev(date);
	return `${diaryFolder}/${year}/${month}/${year}-${month}-${day} ${weekday}`;
}

/**
 * Calculate the path to the next periodic note.
 *
 * MVP: Daily notes only, simple next-day transition
 *
 * Full path format:
 * - Daily: "YYYY/MM/YYYY-MM-DD ddd" (e.g., "2026/01/2026-01-22 Thu")
 *
 * @param noteInfo - Result from parseNoteType
 * @param diaryFolder - The diary folder path (default: '+Diary')
 * @returns Full path to target note (without .md extension)
 */
export function getNextNotePath(noteInfo: NoteInfo, diaryFolder: string = DIARY_FOLDER): string {
	if (!noteInfo) return '';

	const { type, year, month, day } = noteInfo;

	switch (type) {
		case 'daily': {
			if (year === undefined || month === undefined || day === undefined) {
				return '';
			}
			// MVP: Simple next-day transition (no Sunday → weekly check)
			const currentDate = new Date(year, month - 1, day);
			const nextDate = new Date(currentDate);
			nextDate.setDate(nextDate.getDate() + 1);
			return formatDailyPath(nextDate, diaryFolder);
		}

		// TODO (Slice 6): Add weekly, monthly, yearly cases

		default:
			return '';
	}
}
