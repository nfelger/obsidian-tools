import { vi } from 'vitest';

/**
 * Mock for the obsidian-daily-notes-interface package.
 *
 * Tests control behavior via globals:
 * - globalThis.__periodicNoteCreation — { daily?, weekly?, monthly?, yearly? },
 *   each an async (momentDate) => mock TFile. A granularity is "loaded" when
 *   its creation function is present; by default nothing is loaded, so
 *   production code falls back to plain file creation.
 * - globalThis.__periodicNoteSettings — { day?, week?, month?, year? } each
 *   { format, folder, template } for getPeriodicNoteSettings.
 */
const creationConfig = () => globalThis.__periodicNoteCreation || {};

export const appHasDailyNotesPluginLoaded = vi.fn(() => !!creationConfig().daily);
export const appHasWeeklyNotesPluginLoaded = vi.fn(() => !!creationConfig().weekly);
export const appHasMonthlyNotesPluginLoaded = vi.fn(() => !!creationConfig().monthly);
export const appHasYearlyNotesPluginLoaded = vi.fn(() => !!creationConfig().yearly);

export const createDailyNote = vi.fn(async (m) => creationConfig().daily(m));
export const createWeeklyNote = vi.fn(async (m) => creationConfig().weekly(m));
export const createMonthlyNote = vi.fn(async (m) => creationConfig().monthly(m));
export const createYearlyNote = vi.fn(async (m) => creationConfig().yearly(m));

export const getPeriodicNoteSettings = vi.fn((granularity) => {
	const settings = (globalThis.__periodicNoteSettings || {})[granularity];
	return settings || { format: '', folder: '', template: '' };
});
