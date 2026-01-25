import { describe, it, expect } from 'vitest';
import { getISOWeekNumber, getMondayOfISOWeek } from '../../src/utils/periodicNotes';

/**
 * ISO 8601 Week Date Edge Case Tests
 *
 * ISO 8601 Definition:
 * - Week 1 is the week containing the first Thursday of the year
 * - Equivalently, week 1 always contains January 4th
 * - Weeks start on Monday and end on Sunday
 * - A week's year is the Gregorian year in which the Thursday falls
 *
 * Sources:
 * - https://en.wikipedia.org/wiki/ISO_week_date
 * - https://derickrethans.nl/iso-8601-weeks.html
 * - date-fns implementation: https://github.com/date-fns/date-fns
 */

describe('ISO Week Number Edge Cases', () => {
	describe('Year Boundary Cases - 2025/2026', () => {
		it('2025-12-28 (Sunday) should be week 52 of 2025', () => {
			const date = new Date(2025, 11, 28); // Dec 28, 2025 (Sunday)
			const weekNum = getISOWeekNumber(date);
			// Dec 28 is a Sunday. The week Mon Dec 22 - Sun Dec 28 contains Dec 25 (Thursday)
			// which is in 2025, so this is week 52 of 2025
			expect(weekNum).toBe(52);
		});

		it('2025-12-29 (Monday) should be week 1 of 2026', () => {
			const date = new Date(2025, 11, 29); // Dec 29, 2025 (Monday)
			const weekNum = getISOWeekNumber(date);
			// The week Mon Dec 29 - Sun Jan 4 contains Jan 1 (Thursday) 2026
			// So this is week 1 of ISO year 2026
			expect(weekNum).toBe(1);
		});

		it('2025-12-30 (Tuesday) should be week 1 of 2026', () => {
			const date = new Date(2025, 11, 30); // Dec 30, 2025 (Tuesday)
			const weekNum = getISOWeekNumber(date);
			expect(weekNum).toBe(1);
		});

		it('2025-12-31 (Wednesday) should be week 1 of 2026', () => {
			const date = new Date(2025, 11, 31); // Dec 31, 2025 (Wednesday)
			const weekNum = getISOWeekNumber(date);
			expect(weekNum).toBe(1);
		});

		it('2026-01-01 (Thursday) should be week 1 of 2026', () => {
			const date = new Date(2026, 0, 1); // Jan 1, 2026 (Thursday)
			const weekNum = getISOWeekNumber(date);
			// Jan 1 is a Thursday, so it's definitely in week 1 of 2026
			expect(weekNum).toBe(1);
		});

		it('2026-01-04 (Sunday) should be week 1 of 2026', () => {
			const date = new Date(2026, 0, 4); // Jan 4, 2026 (Sunday)
			const weekNum = getISOWeekNumber(date);
			// Jan 4 is always in week 1 (by definition)
			expect(weekNum).toBe(1);
		});

		it('2026-01-05 (Monday) should be week 2 of 2026', () => {
			const date = new Date(2026, 0, 5); // Jan 5, 2026 (Monday)
			const weekNum = getISOWeekNumber(date);
			// This is the Monday after week 1 ends
			expect(weekNum).toBe(2);
		});
	});

	describe('Year Boundary Cases - 2024/2025', () => {
		it('2024-12-30 (Monday) should be week 1 of 2025', () => {
			const date = new Date(2024, 11, 30); // Dec 30, 2024 (Monday)
			const weekNum = getISOWeekNumber(date);
			// The week Mon Dec 30 - Sun Jan 5 contains Jan 2 (Thursday) 2025
			// So this is week 1 of ISO year 2025
			expect(weekNum).toBe(1);
		});

		it('2024-12-31 (Tuesday) should be week 1 of 2025', () => {
			const date = new Date(2024, 11, 31); // Dec 31, 2024 (Tuesday)
			const weekNum = getISOWeekNumber(date);
			expect(weekNum).toBe(1);
		});

		it('2025-01-01 (Wednesday) should be week 1 of 2025', () => {
			const date = new Date(2025, 0, 1); // Jan 1, 2025 (Wednesday)
			const weekNum = getISOWeekNumber(date);
			expect(weekNum).toBe(1);
		});

		it('2025-01-02 (Thursday) should be week 1 of 2025', () => {
			const date = new Date(2025, 0, 2); // Jan 2, 2025 (Thursday)
			const weekNum = getISOWeekNumber(date);
			// Jan 2 is the first Thursday, so it's in week 1
			expect(weekNum).toBe(1);
		});
	});

	describe('53-Week Years', () => {
		it('2026 should have 53 weeks', () => {
			// A year has 53 weeks if Jan 1 is Thursday OR if it's a leap year and Jan 1 is Wednesday
			// 2026: Jan 1 is Thursday (has 53 weeks)
			const lastDayOf2026 = new Date(2026, 11, 31); // Dec 31, 2026 (Thursday)
			const weekNum = getISOWeekNumber(lastDayOf2026);
			expect(weekNum).toBe(53);
		});

		it('2020 had 53 weeks (leap year starting on Wednesday)', () => {
			const lastDayOf2020 = new Date(2020, 11, 31); // Dec 31, 2020 (Thursday)
			const weekNum = getISOWeekNumber(lastDayOf2020);
			expect(weekNum).toBe(53);
		});
	});

	describe('Leap Year Cases', () => {
		it('handles Feb 29 in leap year 2024', () => {
			const date = new Date(2024, 1, 29); // Feb 29, 2024 (Thursday)
			const weekNum = getISOWeekNumber(date);
			// Should be week 9 of 2024
			expect(weekNum).toBe(9);
		});

		it('handles leap day week transitions', () => {
			const feb28 = new Date(2024, 1, 28); // Feb 28, 2024 (Wednesday)
			const feb29 = new Date(2024, 1, 29); // Feb 29, 2024 (Thursday)
			const mar01 = new Date(2024, 2, 1);  // Mar 1, 2024 (Friday)

			expect(getISOWeekNumber(feb28)).toBe(9);
			expect(getISOWeekNumber(feb29)).toBe(9);
			expect(getISOWeekNumber(mar01)).toBe(9);
		});
	});

	describe('Early and Late Week 1 Cases', () => {
		it('earliest possible week 1 start (Jan 4 is Thursday)', () => {
			// When Jan 1 is Thursday, week 1 starts on Dec 29 of previous year
			// 2026: Jan 1 is Thursday
			const dec29_2025 = new Date(2025, 11, 29); // Dec 29, 2025 (Monday)
			expect(getISOWeekNumber(dec29_2025)).toBe(1);
		});

		it('latest possible week 1 start (Jan 4 is Sunday)', () => {
			// When Jan 1 is Friday, week 1 starts on Monday Jan 4
			// 2021: Jan 1 is Friday, Jan 4 is Monday
			const jan04_2021 = new Date(2021, 0, 4); // Jan 4, 2021 (Monday)
			expect(getISOWeekNumber(jan04_2021)).toBe(1);
		});
	});

	describe('Random Sample Dates for Validation', () => {
		it('validates mid-year dates', () => {
			expect(getISOWeekNumber(new Date(2026, 5, 15))).toBe(25); // Jun 15, 2026
			expect(getISOWeekNumber(new Date(2025, 6, 4))).toBe(27);  // Jul 4, 2025
		});
	});
});

describe('getMondayOfISOWeek Edge Cases', () => {
	describe('Round-trip Consistency', () => {
		it('round-trips correctly for week 1 of 2026', () => {
			const monday = getMondayOfISOWeek(2026, 1);
			expect(monday.getFullYear()).toBe(2025);
			expect(monday.getMonth()).toBe(11); // December
			expect(monday.getDate()).toBe(29);
			expect(monday.getDay()).toBe(1); // Monday

			// Verify it produces week 1 when passed to getISOWeekNumber
			expect(getISOWeekNumber(monday)).toBe(1);
		});

		it('round-trips correctly for week 2 of 2026', () => {
			const monday = getMondayOfISOWeek(2026, 2);
			expect(monday.getFullYear()).toBe(2026);
			expect(monday.getMonth()).toBe(0); // January
			expect(monday.getDate()).toBe(5);
			expect(monday.getDay()).toBe(1); // Monday

			expect(getISOWeekNumber(monday)).toBe(2);
		});

		it('round-trips correctly for week 53 of 2026', () => {
			const monday = getMondayOfISOWeek(2026, 53);
			expect(monday.getFullYear()).toBe(2026);
			expect(monday.getMonth()).toBe(11); // December
			expect(monday.getDate()).toBe(28);
			expect(monday.getDay()).toBe(1); // Monday

			expect(getISOWeekNumber(monday)).toBe(53);
		});
	});

	describe('Verify Jan 4 Rule', () => {
		it('week 1 of 2026 should contain Jan 4, 2026', () => {
			const monday = getMondayOfISOWeek(2026, 1);
			const sunday = new Date(monday);
			sunday.setDate(monday.getDate() + 6);

			const jan4 = new Date(2026, 0, 4);

			// Jan 4 should be between the Monday and Sunday of week 1
			expect(jan4.getTime()).toBeGreaterThanOrEqual(monday.getTime());
			expect(jan4.getTime()).toBeLessThanOrEqual(sunday.getTime());
		});

		it('week 1 of 2025 should contain Jan 4, 2025', () => {
			const monday = getMondayOfISOWeek(2025, 1);
			const sunday = new Date(monday);
			sunday.setDate(monday.getDate() + 6);

			const jan4 = new Date(2025, 0, 4);

			expect(jan4.getTime()).toBeGreaterThanOrEqual(monday.getTime());
			expect(jan4.getTime()).toBeLessThanOrEqual(sunday.getTime());
		});
	});

	describe('Boundary Weeks', () => {
		it('handles week 52 of 2025', () => {
			const monday = getMondayOfISOWeek(2025, 52);
			expect(monday.getFullYear()).toBe(2025);
			expect(monday.getMonth()).toBe(11); // December
			expect(monday.getDate()).toBe(22);
			expect(getISOWeekNumber(monday)).toBe(52);
		});

		it('handles transition from week 52 of 2025 to week 1 of 2026', () => {
			const week52 = getMondayOfISOWeek(2025, 52);
			const week1 = getMondayOfISOWeek(2026, 1);

			// Week 1 should be exactly 7 days after week 52
			const diffDays = (week1.getTime() - week52.getTime()) / (1000 * 60 * 60 * 24);
			expect(diffDays).toBe(7);
		});
	});
});

describe('Cross-Validation: getISOWeekNumber and getMondayOfISOWeek', () => {
	describe('Full Year Consistency', () => {
		it('every Monday in 2026 should round-trip correctly', () => {
			// Start from first Monday of 2026
			let date = new Date(2026, 0, 5); // Jan 5, 2026 (Monday, week 2)
			const endDate = new Date(2026, 11, 28); // Dec 28, 2026 (last Monday)

			while (date <= endDate) {
				const weekNum = getISOWeekNumber(date);
				const reconstructed = getMondayOfISOWeek(2026, weekNum);

				expect(reconstructed.getTime()).toBe(date.getTime());

				// Move to next Monday
				date = new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
			}
		});
	});

	describe('Known Reference Dates', () => {
		// From https://www.calendarz.com/blog/iso-week-numbers-explained-week-1-week-53-and-year-boundaries
		const testCases = [
			{ date: new Date(2025, 11, 29), expectedWeek: 1, desc: 'Dec 29, 2025 (Mon) = 2026-W01' },
			{ date: new Date(2025, 11, 31), expectedWeek: 1, desc: 'Dec 31, 2025 (Wed) = 2026-W01' },
			{ date: new Date(2026, 0, 1), expectedWeek: 1, desc: 'Jan 1, 2026 (Thu) = 2026-W01' },
			{ date: new Date(2026, 0, 4), expectedWeek: 1, desc: 'Jan 4, 2026 (Sun) = 2026-W01' },
			{ date: new Date(2026, 0, 5), expectedWeek: 2, desc: 'Jan 5, 2026 (Mon) = 2026-W02' },
			{ date: new Date(2024, 11, 30), expectedWeek: 1, desc: 'Dec 30, 2024 (Mon) = 2025-W01' },
			{ date: new Date(2024, 11, 31), expectedWeek: 1, desc: 'Dec 31, 2024 (Tue) = 2025-W01' },
		];

		testCases.forEach(({ date, expectedWeek, desc }) => {
			it(`${desc}`, () => {
				expect(getISOWeekNumber(date)).toBe(expectedWeek);
			});
		});
	});
});
