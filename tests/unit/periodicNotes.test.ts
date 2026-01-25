import { describe, it, expect } from 'vitest';
import {
	parseNoteType,
	getWeekdayAbbrev,
	getMonthAbbrev,
	isLastDayOfWeek,
	isDecember,
	getISOWeekNumber,
	getMondayOfISOWeek,
	formatDailyPath,
	getNextNotePath
} from '../../src/utils/periodicNotes';

describe('parseNoteType', () => {
	describe('daily notes', () => {
		it('parses daily note format', () => {
			const result = parseNoteType('2026-01-22 Thu');
			expect(result).toEqual({
				type: 'daily',
				year: 2026,
				month: 1,
				day: 22
			});
		});

		it('parses daily note with different weekday', () => {
			const result = parseNoteType('2025-12-31 Wed');
			expect(result).toEqual({
				type: 'daily',
				year: 2025,
				month: 12,
				day: 31
			});
		});

		it('parses daily notes for different weekdays', () => {
			expect(parseNoteType('2026-01-19 Sun')).toEqual({
				type: 'daily',
				year: 2026,
				month: 1,
				day: 19
			});
			expect(parseNoteType('2026-01-20 Mon')).toEqual({
				type: 'daily',
				year: 2026,
				month: 1,
				day: 20
			});
		});
	});

	describe('weekly notes', () => {
		it('parses weekly note format', () => {
			const result = parseNoteType('2026-01-W04');
			expect(result).toEqual({
				type: 'weekly',
				year: 2026,
				month: 1,
				week: 4
			});
		});

		it('parses single-digit week numbers', () => {
			expect(parseNoteType('2026-01-W01')).toEqual({
				type: 'weekly',
				year: 2026,
				month: 1,
				week: 1
			});
		});

		it('parses high week numbers', () => {
			expect(parseNoteType('2026-12-W52')).toEqual({
				type: 'weekly',
				year: 2026,
				month: 12,
				week: 52
			});
		});
	});

	describe('monthly notes', () => {
		it('parses monthly note format', () => {
			const result = parseNoteType('2026-01 Jan');
			expect(result).toEqual({
				type: 'monthly',
				year: 2026,
				month: 1
			});
		});

		it('parses different months', () => {
			expect(parseNoteType('2026-06 Jun')).toEqual({
				type: 'monthly',
				year: 2026,
				month: 6
			});
			expect(parseNoteType('2026-12 Dec')).toEqual({
				type: 'monthly',
				year: 2026,
				month: 12
			});
		});
	});

	describe('yearly notes', () => {
		it('parses yearly note format', () => {
			const result = parseNoteType('2026');
			expect(result).toEqual({
				type: 'yearly',
				year: 2026
			});
		});

		it('parses different years', () => {
			expect(parseNoteType('2025')).toEqual({
				type: 'yearly',
				year: 2025
			});
			expect(parseNoteType('2030')).toEqual({
				type: 'yearly',
				year: 2030
			});
		});
	});

	describe('non-periodic notes', () => {
		it('returns null for project notes', () => {
			expect(parseNoteType('Migration Initiative')).toBeNull();
		});

		it('returns null for area notes', () => {
			expect(parseNoteType('Engineering Leadership')).toBeNull();
		});

		it('returns null for invalid formats', () => {
			expect(parseNoteType('2026-01-22')).toBeNull();
			expect(parseNoteType('Jan 22 2026')).toBeNull();
			expect(parseNoteType('')).toBeNull();
		});
	});
});

describe('getWeekdayAbbrev', () => {
	it('returns correct abbreviation for each day', () => {
		expect(getWeekdayAbbrev(new Date(2026, 0, 4))).toBe('Sun'); // Sunday
		expect(getWeekdayAbbrev(new Date(2026, 0, 5))).toBe('Mon'); // Monday
		expect(getWeekdayAbbrev(new Date(2026, 0, 6))).toBe('Tue'); // Tuesday
		expect(getWeekdayAbbrev(new Date(2026, 0, 7))).toBe('Wed'); // Wednesday
		expect(getWeekdayAbbrev(new Date(2026, 0, 8))).toBe('Thu'); // Thursday
		expect(getWeekdayAbbrev(new Date(2026, 0, 9))).toBe('Fri'); // Friday
		expect(getWeekdayAbbrev(new Date(2026, 0, 10))).toBe('Sat'); // Saturday
	});
});

describe('formatDailyPath', () => {
	it('formats date as daily note path', () => {
		const date = new Date(2026, 0, 22); // Jan 22, 2026 (Thursday)
		const path = formatDailyPath(date);
		expect(path).toBe('+Diary/2026/01/2026-01-22 Thu');
	});

	it('pads single-digit month and day', () => {
		const date = new Date(2026, 0, 5); // Jan 5, 2026 (Monday)
		const path = formatDailyPath(date);
		expect(path).toBe('+Diary/2026/01/2026-01-05 Mon');
	});

	it('handles custom diary folder', () => {
		const date = new Date(2026, 0, 22);
		const path = formatDailyPath(date, 'Journal');
		expect(path).toBe('Journal/2026/01/2026-01-22 Thu');
	});
});

describe('getMonthAbbrev', () => {
	it('returns correct abbreviation for each month', () => {
		expect(getMonthAbbrev(1)).toBe('Jan');
		expect(getMonthAbbrev(2)).toBe('Feb');
		expect(getMonthAbbrev(6)).toBe('Jun');
		expect(getMonthAbbrev(12)).toBe('Dec');
	});
});

describe('isLastDayOfWeek', () => {
	it('returns true for Sunday', () => {
		// 2026-01-18 is a Sunday
		const sunday = new Date(2026, 0, 18);
		expect(isLastDayOfWeek(sunday)).toBe(true);
	});

	it('returns false for Monday through Saturday', () => {
		// 2026-01-19 is Monday, 2026-01-24 is Saturday
		expect(isLastDayOfWeek(new Date(2026, 0, 19))).toBe(false); // Monday
		expect(isLastDayOfWeek(new Date(2026, 0, 20))).toBe(false); // Tuesday
		expect(isLastDayOfWeek(new Date(2026, 0, 21))).toBe(false); // Wednesday
		expect(isLastDayOfWeek(new Date(2026, 0, 22))).toBe(false); // Thursday
		expect(isLastDayOfWeek(new Date(2026, 0, 23))).toBe(false); // Friday
		expect(isLastDayOfWeek(new Date(2026, 0, 24))).toBe(false); // Saturday
	});
});

describe('isDecember', () => {
	it('returns true for December (month 12)', () => {
		expect(isDecember(12)).toBe(true);
	});

	it('returns false for other months', () => {
		expect(isDecember(1)).toBe(false);
		expect(isDecember(6)).toBe(false);
		expect(isDecember(11)).toBe(false);
	});
});

describe('getNextNotePath', () => {
	describe('daily notes - normal case', () => {
		it('returns next day for Monday', () => {
			const noteInfo = { type: 'daily' as const, year: 2026, month: 1, day: 19 }; // Monday
			const result = getNextNotePath(noteInfo);
			expect(result).toBe('+Diary/2026/01/2026-01-20 Tue');
		});

		it('returns next day for Saturday', () => {
			const noteInfo = { type: 'daily' as const, year: 2026, month: 1, day: 24 }; // Saturday
			const result = getNextNotePath(noteInfo);
			expect(result).toBe('+Diary/2026/01/2026-01-25 Sun');
		});

		it('handles month boundaries', () => {
			const noteInfo = { type: 'daily' as const, year: 2026, month: 1, day: 31 }; // Saturday Jan 31
			const result = getNextNotePath(noteInfo);
			expect(result).toBe('+Diary/2026/02/2026-02-01 Sun');
		});

		it('handles year boundaries', () => {
			const noteInfo = { type: 'daily' as const, year: 2026, month: 12, day: 31 }; // Thursday Dec 31
			const result = getNextNotePath(noteInfo);
			expect(result).toBe('+Diary/2027/01/2027-01-01 Fri');
		});
	});

	describe('daily notes - Sunday boundary', () => {
		it('returns next weekly note for Sunday', () => {
			const noteInfo = { type: 'daily' as const, year: 2026, month: 1, day: 18 }; // Sunday
			const result = getNextNotePath(noteInfo);
			// Next week is W04 (week containing Jan 19-25)
			expect(result).toBe('+Diary/2026/01/2026-01-W04');
		});
	});

	describe('weekly notes', () => {
		it('returns next weekly note', () => {
			const noteInfo = { type: 'weekly' as const, year: 2026, month: 1, week: 4 };
			const result = getNextNotePath(noteInfo);
			expect(result).toBe('+Diary/2026/01/2026-01-W05');
		});

		it('handles week number rollover to next month', () => {
			// Week 5 of January 2026 ends in February
			const noteInfo = { type: 'weekly' as const, year: 2026, month: 1, week: 5 };
			const result = getNextNotePath(noteInfo);
			expect(result).toBe('+Diary/2026/02/2026-02-W06');
		});

		it('handles week rollover to next year', () => {
			// Week 52 of 2025 → Week 1 of 2026
			const noteInfo = { type: 'weekly' as const, year: 2025, month: 12, week: 52 };
			const result = getNextNotePath(noteInfo);
			expect(result).toBe('+Diary/2026/01/2026-01-W01');
		});
	});

	describe('monthly notes - normal case', () => {
		it('returns next monthly note', () => {
			const noteInfo = { type: 'monthly' as const, year: 2026, month: 1 };
			const result = getNextNotePath(noteInfo);
			expect(result).toBe('+Diary/2026/2026-02 Feb');
		});

		it('handles November to December', () => {
			const noteInfo = { type: 'monthly' as const, year: 2026, month: 11 };
			const result = getNextNotePath(noteInfo);
			expect(result).toBe('+Diary/2026/2026-12 Dec');
		});
	});

	describe('monthly notes - December boundary', () => {
		it('returns next yearly note for December', () => {
			const noteInfo = { type: 'monthly' as const, year: 2026, month: 12 };
			const result = getNextNotePath(noteInfo);
			expect(result).toBe('+Diary/2027/2027');
		});
	});

	describe('yearly notes', () => {
		it('returns next yearly note', () => {
			const noteInfo = { type: 'yearly' as const, year: 2026 };
			const result = getNextNotePath(noteInfo);
			expect(result).toBe('+Diary/2027/2027');
		});
	});

	describe('custom diary folder', () => {
		it('uses custom diary folder', () => {
			const noteInfo = { type: 'yearly' as const, year: 2026 };
			const result = getNextNotePath(noteInfo, 'Journal');
			expect(result).toBe('Journal/2027/2027');
		});
	});

	it('returns empty string for null noteInfo', () => {
		expect(getNextNotePath(null as any)).toBe('');
	});
});
