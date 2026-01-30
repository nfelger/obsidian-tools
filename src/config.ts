/**
 * Repo-level configuration constants.
 *
 * These values are not user-configurable but are centralized here
 * for maintainability and potential future configuration.
 */

// === Task Marker Patterns ===

/**
 * Regex pattern for incomplete tasks (open or started).
 * Matches: "- [ ]" and "- [/]" with optional leading whitespace.
 */
export const INCOMPLETE_TASK_PATTERN = /^\s*- \[[ /]\]/;

/**
 * Regex pattern to replace incomplete tasks with migrated marker.
 * Captures leading whitespace and "- " prefix.
 */
export const MIGRATE_TASK_PATTERN = /^(\s*- )\[[ /]\]/;

/**
 * The marker used for migrated tasks.
 */
export const MIGRATED_MARKER = '[>]';

/**
 * The marker used for scheduled tasks (pushed down to lower-level note).
 */
export const SCHEDULED_MARKER = '[<]';

/**
 * Regex pattern for scheduled tasks.
 * Matches: "- [<]" with optional leading whitespace.
 */
export const SCHEDULED_TASK_PATTERN = /^\s*- \[<\]/;

/**
 * Regex pattern to replace scheduled marker with open.
 * Captures leading whitespace and "- " prefix.
 */
export const SCHEDULED_TO_OPEN_PATTERN = /^(\s*- )\[<\]/;

/**
 * Regex pattern to convert started tasks to open in target note.
 * Captures "- " prefix to preserve it.
 */
export const STARTED_TO_OPEN_PATTERN = /^(- )\[\/\]/;

/**
 * Replacement for started tasks in target note (open task).
 */
export const OPEN_TASK_MARKER = '[ ]';

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

export interface HotkeyBindingConfig {
	key: string;
	label: string;
	commandId: string;
}

export const HOTKEY_BINDINGS: readonly HotkeyBindingConfig[] = [
	{ key: 'm', label: 'Migrate task', commandId: 'migrateTask' },
	{ key: 'd', label: 'Push task down', commandId: 'pushTaskDown' },
	{ key: 'u', label: 'Pull task up', commandId: 'pullTaskUp' },
	{ key: 'e', label: 'Extract log', commandId: 'extractLog' },
];
