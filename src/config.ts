/**
 * Repo-level configuration constants.
 *
 * These values are not user-configurable but are centralized here
 * for maintainability and potential future configuration.
 */

// === Task Markers ===

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

// === Custom Checkbox CSS ===

/**
 * CSS for custom checkbox markers.
 * Currently supports [o] for meeting marker.
 */
export const CUSTOM_CHECKBOX_CSS = `
/* [o] Meeting marker */

input[data-task="o"]:checked,
li[data-task="o"] > input:checked,
li[data-task="o"] > p > input:checked {
  --checkbox-marker-color: transparent;
  border: none;
  border-radius: 0;
  background-image: none;
  background-color: currentColor;
  -webkit-mask-size: var(--checkbox-icon);
  -webkit-mask-position: 50% 50%;
}

input[data-task="o"]:checked,
li[data-task="o"] > input:checked,
li[data-task="o"] > p > input:checked {
  color: var(--color-red);
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' viewBox='0 0 20 20' fill='currentColor'%3E%3Cpath fill-rule='evenodd' d='M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z' clip-rule='evenodd' /%3E%3C/svg%3E");
}
`;
