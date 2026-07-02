/**
 * TaskState enum and TaskMarker class — the BuJo task state machine.
 *
 * When adding a new task type, update ALL four locations:
 *   1. TaskState enum — add the new state value
 *   2. TaskMarker.fromLine() — add the character in the switch
 *   3. TaskMarker.isIncomplete() — decide if the new state is "incomplete"
 *   4. TaskMarker.isTerminal() — decide if the new state is terminal
 * See docs/key-insights.md for details.
 */

// === Task State Machine ===

/**
 * Explicit task states following BuJo conventions.
 *
 * State transitions:
 * - Open/Started → Migrated (terminal) via migrateTask
 * - Open/Started → Scheduled via pushTaskDown/pullTaskUp
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
 * A task found by text search, with its file-absolute line and state.
 */
export interface TaskMatch {
	lineNumber: number;
	state: TaskState;
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
	 * Check if this task is incomplete (open or started).
	 */
	isIncomplete(): boolean {
		return this.state === TaskState.Open || this.state === TaskState.Started;
	}

	/**
	 * Check if this task is scheduled (pushed down to a lower-level note).
	 */
	isScheduled(): boolean {
		return this.state === TaskState.Scheduled;
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

	/**
	 * Prepend text after the task checkbox.
	 * e.g., prependToContent("- [ ] Task", "[[Project]]") → "- [ ] [[Project]] Task"
	 */
	static prependToContent(line: string, text: string): string {
		return line.replace(/^(\s*- \[.\]\s*)/, `$1${text} `);
	}

	/**
	 * Strip a [[ProjectName]] or [[ProjectName|Alias]] prefix from a task
	 * line's content.
	 * e.g., "- [ ] [[Project]] Task text" → "- [ ] Task text"
	 */
	static stripProjectLink(line: string, projectName: string): string {
		const escaped = projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const pattern = new RegExp(`(- \\[.\\]\\s*)\\[\\[${escaped}(?:\\|[^\\]]*)?\\]\\]\\s*`);
		return line.replace(pattern, '$1');
	}
}

// === Single-line task predicates and transitions ===
//
// Thin TaskMarker wrappers for callers that only have a raw line and want a
// one-shot check or transform, without parsing it themselves. TaskMarker
// remains the single source of truth for marker classification — these
// never duplicate its regex or switch.

/**
 * Check if a line is an incomplete task (open or started).
 */
export function isIncompleteTask(line: string): boolean {
	return TaskMarker.fromLine(line)?.isIncomplete() ?? false;
}

/**
 * Mark an incomplete task line as scheduled ([<]). Lines that aren't
 * incomplete tasks are returned unchanged.
 */
export function markTaskAsScheduled(line: string): string {
	const marker = TaskMarker.fromLine(line);
	if (!marker || !marker.isIncomplete()) return line;
	return marker.toScheduled().applyToLine(line);
}

/**
 * Mark a scheduled task line as open ([ ]). Lines that aren't scheduled
 * tasks are returned unchanged.
 */
export function markScheduledAsOpen(line: string): string {
	const marker = TaskMarker.fromLine(line);
	if (!marker || !marker.isScheduled()) return line;
	return marker.toOpen().applyToLine(line);
}
