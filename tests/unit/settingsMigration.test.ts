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
			diaryFolder: '+Journal',
			periodicNoteTaskTargetHeading: '## Log'
		});
		expect(migrated?.diaryFolder).toBe('+Journal');
	});
});
