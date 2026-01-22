import { describe, it, expect } from 'vitest';
import {
  parseNoteType,
  isLastDayOfWeek,
  isDecember,
  getNextNotePath,
  isIncompleteTask,
  DIARY_FOLDER
} from '../../scripts/migrateTask.js';

describe('migrateTask', () => {
  describe('parseNoteType', () => {
    describe('daily notes', () => {
      it('should parse a daily note filename', () => {
        const result = parseNoteType('2026-01-22 Thu');
        expect(result).toEqual({
          type: 'daily',
          year: 2026,
          month: 1,
          day: 22
        });
      });

      it('should parse daily notes for different weekdays', () => {
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

      it('should parse daily notes across different months', () => {
        expect(parseNoteType('2026-12-31 Thu')).toEqual({
          type: 'daily',
          year: 2026,
          month: 12,
          day: 31
        });
      });
    });

    describe('weekly notes', () => {
      it('should parse a weekly note filename', () => {
        const result = parseNoteType('2026-01-W04');
        expect(result).toEqual({
          type: 'weekly',
          year: 2026,
          month: 1,
          week: 4
        });
      });

      it('should parse single-digit week numbers', () => {
        expect(parseNoteType('2026-01-W01')).toEqual({
          type: 'weekly',
          year: 2026,
          month: 1,
          week: 1
        });
      });

      it('should parse high week numbers', () => {
        expect(parseNoteType('2026-12-W52')).toEqual({
          type: 'weekly',
          year: 2026,
          month: 12,
          week: 52
        });
      });
    });

    describe('monthly notes', () => {
      it('should parse a monthly note filename', () => {
        const result = parseNoteType('2026-01 Jan');
        expect(result).toEqual({
          type: 'monthly',
          year: 2026,
          month: 1
        });
      });

      it('should parse different months', () => {
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
      it('should parse a yearly note filename', () => {
        const result = parseNoteType('2026');
        expect(result).toEqual({
          type: 'yearly',
          year: 2026
        });
      });

      it('should parse different years', () => {
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
      it('should return null for project notes', () => {
        expect(parseNoteType('Migration Initiative')).toBeNull();
      });

      it('should return null for area notes', () => {
        expect(parseNoteType('Engineering Leadership')).toBeNull();
      });

      it('should return null for random strings', () => {
        expect(parseNoteType('Some Random Note')).toBeNull();
        expect(parseNoteType('')).toBeNull();
      });
    });
  });

  describe('isLastDayOfWeek', () => {
    it('should return true for Sunday', () => {
      // 2026-01-18 is a Sunday
      const sunday = new Date(2026, 0, 18);
      expect(isLastDayOfWeek(sunday)).toBe(true);
    });

    it('should return false for Monday through Saturday', () => {
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
    it('should return true for December (month 12)', () => {
      expect(isDecember(12)).toBe(true);
    });

    it('should return false for other months', () => {
      expect(isDecember(1)).toBe(false);
      expect(isDecember(6)).toBe(false);
      expect(isDecember(11)).toBe(false);
    });
  });

  describe('isIncompleteTask', () => {
    it('should return true for incomplete tasks', () => {
      expect(isIncompleteTask('- [ ] Do something')).toBe(true);
    });

    it('should return true for indented incomplete tasks', () => {
      expect(isIncompleteTask('  - [ ] Nested task')).toBe(true);
      expect(isIncompleteTask('    - [ ] Deeply nested')).toBe(true);
    });

    it('should return false for completed tasks', () => {
      expect(isIncompleteTask('- [x] Done')).toBe(false);
      expect(isIncompleteTask('- [X] Also done')).toBe(false);
    });

    it('should return false for migrated tasks', () => {
      expect(isIncompleteTask('- [>] Migrated')).toBe(false);
    });

    it('should return false for plain bullets', () => {
      expect(isIncompleteTask('- Just a note')).toBe(false);
    });

    it('should return false for non-list lines', () => {
      expect(isIncompleteTask('Some text')).toBe(false);
      expect(isIncompleteTask('# Heading')).toBe(false);
    });
  });

  describe('getNextNotePath', () => {
    describe('daily notes - normal case', () => {
      it('should return next day for Monday', () => {
        const noteInfo = { type: 'daily', year: 2026, month: 1, day: 19 }; // Monday
        const result = getNextNotePath(noteInfo);
        expect(result).toBe('+Diary/2026/01/2026-01-20 Tue');
      });

      it('should return next day for Saturday', () => {
        const noteInfo = { type: 'daily', year: 2026, month: 1, day: 24 }; // Saturday
        const result = getNextNotePath(noteInfo);
        expect(result).toBe('+Diary/2026/01/2026-01-25 Sun');
      });

      it('should handle month boundaries', () => {
        const noteInfo = { type: 'daily', year: 2026, month: 1, day: 31 }; // Saturday Jan 31
        const result = getNextNotePath(noteInfo);
        expect(result).toBe('+Diary/2026/02/2026-02-01 Sun');
      });

      it('should handle year boundaries', () => {
        const noteInfo = { type: 'daily', year: 2026, month: 12, day: 31 }; // Thursday Dec 31
        const result = getNextNotePath(noteInfo);
        expect(result).toBe('+Diary/2027/01/2027-01-01 Fri');
      });
    });

    describe('daily notes - Sunday boundary', () => {
      it('should return next weekly note for Sunday', () => {
        const noteInfo = { type: 'daily', year: 2026, month: 1, day: 18 }; // Sunday
        const result = getNextNotePath(noteInfo);
        // Next week is W04 (week containing Jan 19-25)
        expect(result).toBe('+Diary/2026/01/2026-01-W04');
      });
    });

    describe('weekly notes', () => {
      it('should return next weekly note', () => {
        const noteInfo = { type: 'weekly', year: 2026, month: 1, week: 4 };
        const result = getNextNotePath(noteInfo);
        expect(result).toBe('+Diary/2026/01/2026-01-W05');
      });

      it('should handle week number rollover to next month', () => {
        // Week 5 of January 2026 ends in February
        const noteInfo = { type: 'weekly', year: 2026, month: 1, week: 5 };
        const result = getNextNotePath(noteInfo);
        expect(result).toBe('+Diary/2026/02/2026-02-W06');
      });
    });

    describe('monthly notes - normal case', () => {
      it('should return next monthly note', () => {
        const noteInfo = { type: 'monthly', year: 2026, month: 1 };
        const result = getNextNotePath(noteInfo);
        expect(result).toBe('+Diary/2026/2026-02 Feb');
      });

      it('should handle November to December', () => {
        const noteInfo = { type: 'monthly', year: 2026, month: 11 };
        const result = getNextNotePath(noteInfo);
        expect(result).toBe('+Diary/2026/2026-12 Dec');
      });
    });

    describe('monthly notes - December boundary', () => {
      it('should return next yearly note for December', () => {
        const noteInfo = { type: 'monthly', year: 2026, month: 12 };
        const result = getNextNotePath(noteInfo);
        expect(result).toBe('+Diary/2027/2027');
      });
    });

    describe('yearly notes', () => {
      it('should return next yearly note', () => {
        const noteInfo = { type: 'yearly', year: 2026 };
        const result = getNextNotePath(noteInfo);
        expect(result).toBe('+Diary/2027/2027');
      });
    });

    describe('custom diary folder', () => {
      it('should use custom diary folder', () => {
        const noteInfo = { type: 'yearly', year: 2026 };
        const result = getNextNotePath(noteInfo, 'Journal');
        expect(result).toBe('Journal/2027/2027');
      });
    });
  });
});
