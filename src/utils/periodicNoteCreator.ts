/**
 * Boundary wrapper around the obsidian-daily-notes-interface package.
 *
 * The package reads the user's Daily Notes / Periodic Notes plugin settings
 * (folder, filename format, template) and creates periodic notes for any
 * date with the configured template applied ({{date}}, {{time}}, {{title}}
 * tokens). Keeping it behind this module means the rest of the codebase
 * never touches the package directly.
 */

import type { TFile } from 'obsidian';
import { moment } from 'obsidian';
import {
	appHasDailyNotesPluginLoaded,
	appHasWeeklyNotesPluginLoaded,
	appHasMonthlyNotesPluginLoaded,
	appHasYearlyNotesPluginLoaded,
	createDailyNote,
	createWeeklyNote,
	createMonthlyNote,
	createYearlyNote
} from 'obsidian-daily-notes-interface';
import type { NoteInfo } from '../types';
import { getMondayOfISOWeek } from './periodicNotes';

/**
 * Create the periodic note described by noteInfo using the user's
 * Daily Notes / Periodic Notes configuration, template included.
 *
 * Returns null when the granularity isn't enabled in those plugins or
 * creation fails — callers fall back to creating a plain empty note.
 */
export async function createPeriodicNoteFromTemplate(noteInfo: NoteInfo): Promise<TFile | null> {
	try {
		switch (noteInfo.type) {
			case 'daily': {
				if (!appHasDailyNotesPluginLoaded()) return null;
				const { year, month, day } = noteInfo;
				if (year === undefined || month === undefined || day === undefined) return null;
				return (await createDailyNote(moment(new Date(year, month - 1, day)))) ?? null;
			}
			case 'weekly': {
				if (!appHasWeeklyNotesPluginLoaded()) return null;
				if (noteInfo.week === undefined) return null;
				return (await createWeeklyNote(moment(getMondayOfISOWeek(noteInfo.year, noteInfo.week)))) ?? null;
			}
			case 'monthly': {
				if (!appHasMonthlyNotesPluginLoaded()) return null;
				if (noteInfo.month === undefined) return null;
				return (await createMonthlyNote(moment(new Date(noteInfo.year, noteInfo.month - 1, 1)))) ?? null;
			}
			case 'yearly': {
				if (!appHasYearlyNotesPluginLoaded()) return null;
				return (await createYearlyNote(moment(new Date(noteInfo.year, 0, 1)))) ?? null;
			}
			default:
				return null;
		}
	} catch (e) {
		console.error('createPeriodicNoteFromTemplate error:', e);
		return null;
	}
}
