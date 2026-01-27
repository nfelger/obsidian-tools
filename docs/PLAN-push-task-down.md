# Plan: Push Task Down

## Overview

A new command that schedules incomplete tasks to the **current lower-level periodic note** and marks the source task as scheduled (`[<]`).

**Direction comparison:**
- `migrateTask` → moves tasks **forward in time** (same level: today → tomorrow, this week → next week)
- `pushTaskDown` → moves tasks **down the hierarchy** (different level: yearly → monthly → weekly → daily)

## User Story

> As a user reviewing my weekly note, I want to schedule a task to today's daily note so that I can plan my day while keeping my weekly overview clean.

**Example:**
```
# Weekly note: 2026-W04

- [ ] Write quarterly report    ← cursor here, invoke "Push Task Down"
  - Research Q4 numbers
  - Draft executive summary
```

**Result:**
```
# Weekly note: 2026-W04 (source)
- [<] Write quarterly report    ← marked as scheduled

# Daily note: 2026-01-27 Mon (target, current day)
- [ ] Write quarterly report    ← task + children moved here
  - Research Q4 numbers
  - Draft executive summary
```

## Target Resolution

The target is determined by the **current date** and the **source note type**:

| Source Type | Target Type | Target Note |
|-------------|-------------|-------------|
| Yearly | Monthly | Current month |
| Monthly | Weekly | Current week |
| Weekly | Daily | Current day |
| Daily | — | Error: "Already at lowest level" |

**Edge case: Source doesn't contain current date**

If the user is viewing a periodic note that doesn't include today (e.g., viewing 2025 yearly note in January 2026), show an error:

> "Push Task Down requires the current period. Use Migrate Task to move tasks forward."

This keeps the mental model simple: "push down" always targets **now**.

## Scheduled Marker: `[<]`

BuJo uses `<` to indicate a task has been scheduled (moved to a more specific time).

**Config changes (`src/config.ts`):**
```typescript
export const SCHEDULED_MARKER = '<';
export const SCHEDULE_TASK_PATTERN = /^(\s*- )\[[ /]\]/;  // Same pattern, different replacement
```

## Implementation Slices

### Slice 1: Core Utilities

**File:** `src/utils/periodicNotes.ts`

Add functions to support "push down" navigation:

```typescript
/**
 * Get the lower-level periodic note path for the current date.
 *
 * @param sourceNoteInfo - The current note's info
 * @param today - The current date (for testability)
 * @param settings - Plugin settings
 * @returns Path to target note, or null if at lowest level
 * @throws Error if source period doesn't contain today
 */
export function getLowerNotePath(
  sourceNoteInfo: NoteInfo,
  today: Date,
  settings: BulletFlowSettings
): string | null;

/**
 * Check if a date falls within a periodic note's range.
 */
export function dateIsInPeriod(date: Date, noteInfo: NoteInfo): boolean;

/**
 * Get the NoteInfo for the current lower-level note containing today.
 */
export function getCurrentLowerNoteInfo(
  sourceNoteInfo: NoteInfo,
  today: Date
): NoteInfo | null;
```

**Implementation notes:**
- `dateIsInPeriod` needs to handle all four note types
- Weekly period uses ISO week boundaries (Monday–Sunday)
- Monthly uses calendar month
- Yearly uses calendar year

**Tests:** `tests/unit/periodicNotes.test.ts`
- Date within/outside each period type
- Boundary dates (first/last day of period)
- ISO week edge cases at year boundaries

### Slice 2: Task Marker for Scheduled

**File:** `src/config.ts`

Add scheduled marker:
```typescript
export const SCHEDULED_MARKER = '<';
```

**File:** `src/utils/tasks.ts`

Add function:
```typescript
/**
 * Mark a task as scheduled by replacing checkbox with [<].
 */
export function markTaskAsScheduled(line: string): string;
```

**Tests:** `tests/unit/tasks.test.ts`
- `- [ ] Task` → `- [<] Task`
- `- [/] Started task` → `- [<] Started task`
- Preserves indentation and content

### Slice 3: Command Implementation

**File:** `src/commands/pushTaskDown.ts`

```typescript
import { Notice } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { getActiveMarkdownFile, getListItems } from '../utils/commandSetup';
import { parseNoteType, getLowerNotePath, dateIsInPeriod } from '../utils/periodicNotes';
import { findTopLevelTasksInRange, markTaskAsScheduled, insertUnderTargetHeading } from '../utils/tasks';
import { findChildrenBlockFromListItems, dedentLinesByAmount } from '../utils/listItems';

export async function pushTaskDown(plugin: BulletFlowPlugin): Promise<void> {
  // 1. Get context and validate source is a periodic note
  // 2. Check source period contains today
  // 3. Calculate target (lower-level note for today)
  // 4. Verify target file exists
  // 5. Find selected incomplete tasks
  // 6. Process each task:
  //    - Copy task + children to target (under "## Log" heading)
  //    - Mark source task as [<]
  //    - Remove children from source
  // 7. Show success notice
}
```

**Flow mirrors `migrateTask.ts` closely**, with key differences:
- Target calculation uses `getLowerNotePath()` instead of `getNextNotePath()`
- Source marker is `[<]` instead of `[>]`
- Validation includes "period contains today" check

### Slice 4: Integration Tests

**File:** `tests/integration/pushTaskDown.plugin.test.ts`

Test cases:
1. Weekly → Daily (happy path)
2. Monthly → Weekly
3. Yearly → Monthly
4. Daily → Error
5. Multi-task selection
6. Task with nested children
7. Source period doesn't contain today → Error
8. Target file doesn't exist → Error

**File:** `tests/helpers/pushTaskDownTestHelper.ts`

Mirror structure of `migrateTaskTestHelper.ts`.

### Slice 5: Register Command & Polish

**File:** `src/main.ts`

```typescript
import { pushTaskDown } from './commands/pushTaskDown';

// In onload():
this.addCommand({
  id: 'push-task-down',
  name: 'Push task down to lower periodic note',
  callback: () => pushTaskDown(this)
});
```

**Polish:**
- Notice messages consistent with `migrateTask`
- Error messages are user-friendly

## File Changes Summary

| File | Change Type |
|------|-------------|
| `src/commands/pushTaskDown.ts` | New file |
| `src/utils/periodicNotes.ts` | Add 3 functions |
| `src/utils/tasks.ts` | Add 1 function |
| `src/config.ts` | Add scheduled marker |
| `src/main.ts` | Register command |
| `tests/unit/periodicNotes.test.ts` | Add tests for new functions |
| `tests/unit/tasks.test.ts` | Add test for markTaskAsScheduled |
| `tests/integration/pushTaskDown.plugin.test.ts` | New file |
| `tests/helpers/pushTaskDownTestHelper.ts` | New file |

## Open Questions

1. **Target heading**: Should "pushed down" tasks go under `## Log` (same as extracted content) or a different heading like `## Scheduled`?

   **Recommendation:** Use `## Log` for consistency. The heading name can be made configurable later if needed.

2. **Keyboard shortcut**: Should we suggest a default hotkey?

   **Recommendation:** No default hotkey. Users can assign their own in Obsidian settings.

3. **What if multiple days selected in weekly view?**: If user highlights multiple days of tasks, should we allow pushing to different target days, or only to a single target?

   **Recommendation:** For MVP, all selected tasks go to the **same** target (today's daily note). More granular control can be added later.

## Success Criteria

- [ ] Command appears in Obsidian command palette
- [ ] Weekly → Daily works with single task
- [ ] Weekly → Daily works with multi-select
- [ ] Monthly → Weekly works
- [ ] Yearly → Monthly works
- [ ] Daily shows appropriate error
- [ ] Past/future periods show appropriate error
- [ ] Task children are moved correctly
- [ ] Source marked with `[<]`
- [ ] All tests pass

## Timeline Estimate

Not provided per project guidelines. Work is divided into 5 sequential slices that can be completed incrementally.
