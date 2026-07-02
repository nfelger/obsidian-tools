/**
 * Repo-level configuration constants.
 *
 * These values are not user-configurable but are centralized here
 * for maintainability and potential future configuration.
 */

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
] as const;

export type CommandId = typeof HOTKEY_BINDINGS[number]['commandId'];
