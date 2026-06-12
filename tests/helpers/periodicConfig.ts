import type { PeriodicConfig } from '../../src/types';
import { DEFAULT_PERIODIC_CONFIG } from '../../src/types';

/**
 * Build a periodic config with all granularities in the given folder,
 * keeping the default filename formats.
 */
export function periodicConfigWithFolder(folder: string): PeriodicConfig {
	return {
		daily: { ...DEFAULT_PERIODIC_CONFIG.daily, folder },
		weekly: { ...DEFAULT_PERIODIC_CONFIG.weekly, folder },
		monthly: { ...DEFAULT_PERIODIC_CONFIG.monthly, folder },
		yearly: { ...DEFAULT_PERIODIC_CONFIG.yearly, folder }
	};
}

/**
 * Map a PeriodicConfig to the granularity keys used by the
 * obsidian-daily-notes-interface mock (globalThis.__periodicNoteSettings),
 * so commands resolve the same locations the test helper computed with.
 */
export function asInterfaceSettings(config: PeriodicConfig): Record<string, { format: string; folder: string; template: string }> {
	return {
		day: { format: config.daily.format, folder: config.daily.folder, template: '' },
		week: { format: config.weekly.format, folder: config.weekly.folder, template: '' },
		month: { format: config.monthly.format, folder: config.monthly.folder, template: '' },
		year: { format: config.yearly.format, folder: config.yearly.folder, template: '' }
	};
}
