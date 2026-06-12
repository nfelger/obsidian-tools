import { describe, it, expect, afterEach } from 'vitest';
import { getPeriodicConfig } from '../../src/utils/periodicNoteCreator';
import { DEFAULT_PERIODIC_CONFIG } from '../../src/types';

afterEach(() => {
	delete (globalThis as any).__periodicNoteSettings;
});

describe('getPeriodicConfig', () => {
	it('falls back to defaults when Daily Notes / Periodic Notes are not available', () => {
		expect(getPeriodicConfig()).toEqual(DEFAULT_PERIODIC_CONFIG);
	});

	it('uses folder and format from the Periodic Notes settings', () => {
		(globalThis as any).__periodicNoteSettings = {
			day: { format: 'YYYY-MM-DD', folder: 'Journal/Daily', template: '' }
		};

		const config = getPeriodicConfig();
		expect(config.daily).toEqual({ folder: 'Journal/Daily', format: 'YYYY-MM-DD' });
		// Unconfigured granularities keep the defaults
		expect(config.weekly).toEqual(DEFAULT_PERIODIC_CONFIG.weekly);
	});

	it('resolves each granularity independently', () => {
		(globalThis as any).__periodicNoteSettings = {
			week: { format: 'gggg-[W]ww', folder: 'Weekly', template: '' },
			year: { format: 'YYYY', folder: '', template: '' }
		};

		const config = getPeriodicConfig();
		expect(config.weekly).toEqual({ folder: 'Weekly', format: 'gggg-[W]ww' });
		expect(config.yearly).toEqual({ folder: '', format: 'YYYY' });
		expect(config.daily).toEqual(DEFAULT_PERIODIC_CONFIG.daily);
	});
});
