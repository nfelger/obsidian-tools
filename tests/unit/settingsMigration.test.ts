import { describe, it, expect } from 'vitest';
import { migrateSettings, SETTINGS_VERSION } from '../../src/types';

describe('migrateSettings', () => {
	it('returns null for a fresh install (no saved data)', () => {
		expect(migrateSettings(null)).toBeNull();
	});

	it('updates the pre-0.11.1 default task heading from ## Log to ## Todo', () => {
		const migrated = migrateSettings({ periodicNoteTaskTargetHeading: '## Log' });
		expect(migrated?.periodicNoteTaskTargetHeading).toBe('## Todo');
		expect(migrated?.settingsVersion).toBe(SETTINGS_VERSION);
	});

	it('keeps a custom task heading untouched', () => {
		const migrated = migrateSettings({ periodicNoteTaskTargetHeading: '### Inbox' });
		expect(migrated?.periodicNoteTaskTargetHeading).toBe('### Inbox');
		expect(migrated?.settingsVersion).toBe(SETTINGS_VERSION);
	});

	it('does not touch already-versioned settings', () => {
		const migrated = migrateSettings({
			settingsVersion: SETTINGS_VERSION,
			periodicNoteTaskTargetHeading: '## Log'
		});
		expect(migrated?.periodicNoteTaskTargetHeading).toBe('## Log');
	});

	it('preserves unrelated settings', () => {
		const migrated = migrateSettings({
			projectsFolder: 'Projects',
			periodicNoteTaskTargetHeading: '## Log'
		});
		expect(migrated?.projectsFolder).toBe('Projects');
	});

	it('drops legacy filename pattern settings (now read from Periodic Notes)', () => {
		const migrated = migrateSettings({
			settingsVersion: 1,
			diaryFolder: '+Diary',
			dailyNotePattern: 'YYYY/MM/YYYY-MM-DD ddd',
			weeklyNotePattern: 'gggg/MM/gggg-MM-[W]WW',
			monthlyNotePattern: 'YYYY/YYYY-MM MMM',
			yearlyNotePattern: 'YYYY/YYYY'
		} as any) as any;

		expect(migrated.diaryFolder).toBeUndefined();
		expect(migrated.dailyNotePattern).toBeUndefined();
		expect(migrated.weeklyNotePattern).toBeUndefined();
		expect(migrated.monthlyNotePattern).toBeUndefined();
		expect(migrated.yearlyNotePattern).toBeUndefined();
		expect(migrated.settingsVersion).toBe(SETTINGS_VERSION);
	});
});
