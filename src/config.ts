/**
 * Repo-level configuration constants.
 *
 * These values are not user-configurable but are centralized here
 * for maintainability and potential future configuration.
 */

import type { PeriodicGranularity } from './types';

// === Notice Timeouts ===

/**
 * Duration for success notices (milliseconds).
 */
export const NOTICE_TIMEOUT_SUCCESS = 4000;

/**
 * Duration for error notices (milliseconds).
 */
export const NOTICE_TIMEOUT_ERROR = 8000;

// === Hotkey Modal Bindings ===

export const HOTKEY_BINDINGS = [
	{ key: 'm', label: 'Migrate task', commandId: 'migrateTask' },
	{ key: 'd', label: 'Push task down', commandId: 'pushTaskDown' },
	{ key: 'u', label: 'Pull task up', commandId: 'pullTaskUp' },
	{ key: 'x', label: 'Extract log', commandId: 'extractLog' },
	{ key: 't', label: 'Take project task', commandId: 'takeProjectTask' },
	{ key: 'p', label: 'Drop task to project', commandId: 'dropTaskToProject' },
	{ key: 'c', label: 'Complete project task', commandId: 'completeProjectTask' },
	{ key: 'f', label: 'Finish project', commandId: 'finishProject' },
	{ key: 'g', label: 'Toggle collector', commandId: 'toggleCollectorTask' },
] as const;

export type CommandId = typeof HOTKEY_BINDINGS[number]['commandId'];

// === Period Picker ===

/**
 * The periods a task can be sent to, in the order the picker offers them:
 * the key that selects one, its label, and how a notice names the note.
 */
export const PERIOD_CHOICES = [
	{ key: 'd', label: 'Day', granularity: 'daily', noteLabel: 'daily note' },
	{ key: 'w', label: 'Week', granularity: 'weekly', noteLabel: 'weekly note' },
	{ key: 'm', label: 'Month', granularity: 'monthly', noteLabel: 'monthly note' },
	{ key: 'y', label: 'Year', granularity: 'yearly', noteLabel: 'yearly note' },
] as const satisfies ReadonlyArray<{
	key: string;
	label: string;
	granularity: PeriodicGranularity;
	noteLabel: string;
}>;

/**
 * How a notice names the periodic note of a granularity, e.g. 'weekly note'.
 */
export function periodNoteLabel(granularity: PeriodicGranularity): string {
	return PERIOD_CHOICES.find(choice => choice.granularity === granularity)!.noteLabel;
}
