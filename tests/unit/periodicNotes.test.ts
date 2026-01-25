import { describe, it, expect } from 'vitest';
import {
	parseNoteType,
	getWeekdayAbbrev,
	formatDailyPath,
	getNextNotePath
} from '../../src/utils/periodicNotes';

describe('parseNoteType', () => {
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

	it('returns null for invalid format', () => {
		expect(parseNoteType('2026-01-22')).toBeNull();
		expect(parseNoteType('Jan 22 2026')).toBeNull();
		expect(parseNoteType('')).toBeNull();
	});

	it('returns null for weekly format (MVP: not supported yet)', () => {
		expect(parseNoteType('2026-01-W04')).toBeNull();
	});

	it('returns null for monthly format (MVP: not supported yet)', () => {
		expect(parseNoteType('2026-01 Jan')).toBeNull();
	});

	it('returns null for yearly format (MVP: not supported yet)', () => {
		expect(parseNoteType('2026')).toBeNull();
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

describe('getNextNotePath', () => {
	it('returns next daily note path', () => {
		const noteInfo = {
			type: 'daily' as const,
			year: 2026,
			month: 1,
			day: 22
		};
		const nextPath = getNextNotePath(noteInfo);
		expect(nextPath).toBe('+Diary/2026/01/2026-01-23 Fri');
	});

	it('handles month boundary', () => {
		const noteInfo = {
			type: 'daily' as const,
			year: 2026,
			month: 1,
			day: 31
		};
		const nextPath = getNextNotePath(noteInfo);
		expect(nextPath).toBe('+Diary/2026/02/2026-02-01 Sun');
	});

	it('handles year boundary', () => {
		const noteInfo = {
			type: 'daily' as const,
			year: 2025,
			month: 12,
			day: 31
		};
		const nextPath = getNextNotePath(noteInfo);
		expect(nextPath).toBe('+Diary/2026/01/2026-01-01 Thu');
	});

	it('returns empty string for null noteInfo', () => {
		expect(getNextNotePath(null as any)).toBe('');
	});

	it('returns empty string for unsupported note type (MVP)', () => {
		const noteInfo = {
			type: 'weekly' as const,
			year: 2026,
			month: 1,
			week: 4
		};
		const nextPath = getNextNotePath(noteInfo);
		expect(nextPath).toBe('');
	});
});
