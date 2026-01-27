/**
 * Repo-level configuration constants.
 *
 * These values are not user-configurable but are centralized here
 * for maintainability and potential future configuration.
 */

// === Task State Machine ===

/**
 * Explicit task states following BuJo conventions.
 *
 * State transitions:
 * - Open/Started → Migrated (terminal) via migrateTask
 * - Open/Started → Scheduled via pushTaskDown/pullUp
 * - Scheduled → Open via merge in target note
 * - Open/Started → Completed (terminal) via user action
 */
export enum TaskState {
	Open = ' ',
	Started = '/',
	Completed = 'x',
	Migrated = '>',
	Scheduled = '<',
}

/**
 * Task marker value object with state transition methods.
 */
export class TaskMarker {
	constructor(public readonly state: TaskState) {}

	/**
	 * Parse a task marker from a line of text.
	 * Returns null if the line is not a task.
	 */
	static fromLine(line: string): TaskMarker | null {
		const match = line.match(/^\s*- \[(.)\]/);
		if (!match) return null;

		const char = match[1];
		switch (char) {
			case ' ': return new TaskMarker(TaskState.Open);
			case '/': return new TaskMarker(TaskState.Started);
			case 'x':
			case 'X': return new TaskMarker(TaskState.Completed);
			case '>': return new TaskMarker(TaskState.Migrated);
			case '<': return new TaskMarker(TaskState.Scheduled);
			default: return null;
		}
	}

	/**
	 * Check if this task can be migrated (open or started).
	 */
	canMigrate(): boolean {
		return this.state === TaskState.Open || this.state === TaskState.Started;
	}

	/**
	 * Check if this task can be reopened (scheduled only).
	 */
	canReopen(): boolean {
		return this.state === TaskState.Scheduled;
	}

	/**
	 * Check if this task is incomplete (open or started).
	 */
	isIncomplete(): boolean {
		return this.state === TaskState.Open || this.state === TaskState.Started;
	}

	/**
	 * Check if this task is in a terminal state (completed or migrated).
	 */
	isTerminal(): boolean {
		return this.state === TaskState.Completed || this.state === TaskState.Migrated;
	}

	/**
	 * Create a migrated marker.
	 */
	toMigrated(): TaskMarker {
		return new TaskMarker(TaskState.Migrated);
	}

	/**
	 * Create a scheduled marker.
	 */
	toScheduled(): TaskMarker {
		return new TaskMarker(TaskState.Scheduled);
	}

	/**
	 * Create an open marker.
	 */
	toOpen(): TaskMarker {
		return new TaskMarker(TaskState.Open);
	}

	/**
	 * Render the marker as a string (e.g., "[ ]", "[>]").
	 */
	render(): string {
		return `[${this.state}]`;
	}

	/**
	 * Apply this marker to a task line, replacing the existing marker.
	 */
	applyToLine(line: string): string {
		return line.replace(/^(\s*- )\[.\]/, `$1${this.render()}`);
	}
}

// === Legacy Task Markers (for backward compatibility) ===

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
