/**
 * Utilities for working with periodic notes (daily, weekly, monthly, yearly).
 */

const DIARY_FOLDER = '+Diary';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
 * Filename formats (basename only, without path):
 * - Daily: "YYYY-MM-DD ddd" (e.g., "2026-01-22 Thu")
 * - Weekly: "YYYY-MM-Www" (e.g., "2026-01-W04")
 * - Monthly: "YYYY-MM mmm" (e.g., "2026-01 Jan")
 * - Yearly: "YYYY" (e.g., "2026")
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

	// Weekly: "YYYY-MM-Www" (e.g., "2026-01-W04")
	const weeklyMatch = filename.match(/^(\d{4})-(\d{2})-W(\d{2})$/);
	if (weeklyMatch) {
		return {
			type: 'weekly',
			year: parseInt(weeklyMatch[1], 10),
			month: parseInt(weeklyMatch[2], 10),
			week: parseInt(weeklyMatch[3], 10)
		};
	}

	// Monthly: "YYYY-MM mmm" (e.g., "2026-01 Jan")
	const monthlyMatch = filename.match(/^(\d{4})-(\d{2}) [A-Z][a-z]{2}$/);
	if (monthlyMatch) {
		return {
			type: 'monthly',
			year: parseInt(monthlyMatch[1], 10),
			month: parseInt(monthlyMatch[2], 10)
		};
	}

	// Yearly: "YYYY" (e.g., "2026")
	const yearlyMatch = filename.match(/^(\d{4})$/);
	if (yearlyMatch) {
		return {
			type: 'yearly',
			year: parseInt(yearlyMatch[1], 10)
		};
	}

	return null;
}

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
	// Sunday is day 0 in JavaScript, which is the last day of our week (Mon-Sun)
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
	const dayNum = d.getUTCDay() || 7; // Make Sunday = 7
	d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Set to nearest Thursday
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Get the Monday of a given ISO week.
 */
export function getMondayOfISOWeek(year: number, week: number): Date {
	// Jan 4 is always in week 1
	const jan4 = new Date(year, 0, 4);
	const dayOfWeek = jan4.getDay() || 7; // Make Sunday = 7
	const mondayOfWeek1 = new Date(jan4);
	mondayOfWeek1.setDate(jan4.getDate() - dayOfWeek + 1);

	// Add (week - 1) * 7 days to get to the target week
	const targetMonday = new Date(mondayOfWeek1);
	targetMonday.setDate(mondayOfWeek1.getDate() + (week - 1) * 7);
	return targetMonday;
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
 * Full path formats:
 * - Daily: "YYYY/MM/YYYY-MM-DD ddd" (e.g., "2026/01/2026-01-22 Thu")
 * - Weekly: "YYYY/MM/YYYY-MM-Www" (e.g., "2026/01/2026-01-W04")
 * - Monthly: "YYYY/YYYY-MM mmm" (e.g., "2026/2026-01 Jan")
 * - Yearly: "YYYY/YYYY" (e.g., "2026/2026")
 *
 * Boundary rules:
 * - Daily (Sunday) → next Weekly
 * - Weekly → always next Weekly
 * - Monthly (December) → next Yearly
 * - Yearly → always next Yearly
 *
 * @param noteInfo - Result from parseNoteType
 * @param diaryFolder - The diary folder path (default: '+Diary')
 * @returns Full path to target note (without .md extension)
 */
export function getNextNotePath(noteInfo: NoteInfo, diaryFolder: string = DIARY_FOLDER): string {
	if (!noteInfo) return '';

	const { type, year, month, day, week } = noteInfo;

	switch (type) {
		case 'daily': {
			if (year === undefined || month === undefined || day === undefined) {
				return '';
			}
			const date = new Date(year, month - 1, day);
			if (isLastDayOfWeek(date)) {
				// Sunday → next weekly note
				const nextWeek = getISOWeekNumber(new Date(year, month - 1, day + 1));
				const nextDate = new Date(year, month - 1, day + 1);
				const nextYear = nextDate.getFullYear();
				const nextMonth = String(nextDate.getMonth() + 1).padStart(2, '0');
				return `${diaryFolder}/${nextYear}/${nextMonth}/${nextYear}-${nextMonth}-W${String(nextWeek).padStart(2, '0')}`;
			} else {
				// Normal case → next daily note
				const nextDate = new Date(year, month - 1, day + 1);
				return formatDailyPath(nextDate, diaryFolder);
			}
		}

		case 'weekly': {
			if (year === undefined || week === undefined) {
				return '';
			}
			// Always go to next weekly note
			// Calculate the Monday of the next week
			const mondayOfCurrentWeek = getMondayOfISOWeek(year, week);
			const mondayOfNextWeek = new Date(mondayOfCurrentWeek);
			mondayOfNextWeek.setDate(mondayOfNextWeek.getDate() + 7);

			// Use Thursday to determine ISO year and month (Thursday defines which year a week belongs to)
			const thursdayOfNextWeek = new Date(mondayOfNextWeek);
			thursdayOfNextWeek.setDate(thursdayOfNextWeek.getDate() + 3);

			const nextYear = thursdayOfNextWeek.getFullYear();
			const nextMonth = String(thursdayOfNextWeek.getMonth() + 1).padStart(2, '0');
			const nextWeek = getISOWeekNumber(mondayOfNextWeek);
			return `${diaryFolder}/${nextYear}/${nextMonth}/${nextYear}-${nextMonth}-W${String(nextWeek).padStart(2, '0')}`;
		}

		case 'monthly': {
			if (year === undefined || month === undefined) {
				return '';
			}
			if (isDecember(month)) {
				// December → next yearly note
				return `${diaryFolder}/${year + 1}/${year + 1}`;
			} else {
				// Normal case → next monthly note
				const nextMonth = month + 1;
				const monthStr = String(nextMonth).padStart(2, '0');
				const monthName = getMonthAbbrev(nextMonth);
				return `${diaryFolder}/${year}/${year}-${monthStr} ${monthName}`;
			}
		}

		case 'yearly': {
			if (year === undefined) {
				return '';
			}
			// Always go to next yearly note
			return `${diaryFolder}/${year + 1}/${year + 1}`;
		}

		default:
			return '';
	}
}
