# Key Insights

Project-specific technical knowledge for subsystems with non-obvious behavior.
Reference this when working on periodic notes, wikilink parsing, or list hierarchy.

## Periodic Notes: ISO Week Numbering

- Week 1 contains the first Thursday of the year (always contains January 4th)
- Weeks start Monday, end Sunday
- Some years have 53 weeks (e.g., 2020, 2026)

Functions: `getISOWeekNumber()`, `getMondayOfISOWeek()` in `src/utils/periodicNotes.ts` —
verified correct against ISO 8601 spec and date-fns. Don't reimplement.

**Migration boundary rules:**
- Daily (last day of week) → next Weekly
- Weekly → always next Weekly
- Monthly (December) → next Yearly
- Yearly → always next Yearly

**Week systems:** the weekly format token decides everything. `WW`/`W` = ISO weeks
(Monday-start, Thursday determines the month, Sunday is the migration boundary);
`ww`/`w` = locale weeks (Sunday-start in `en`, the week's first day determines the
month, Saturday is the migration boundary). `usesLocaleWeeks()` in
`src/utils/periodicNotes.ts` is the single switch — never hardcode `isoWeek`
in new week math.

## Wikilink Parsing

Supported formats: `[[Note]]`, `[[Note|Alias]]`, `[[Note#Section]]`, `[[Note#Section|Alias]]`

Edge cases in `src/utils/wikilinks.ts`:
- Multiple `|`: last parts are alias (e.g., `[[Note|Some|Text]]`)
- Multiple `#`: last parts are section (e.g., `[[Note#A#B]]`)
- Nested wikilinks stripped from display text to avoid `[[...]]` in section anchors

## List Item Hierarchy

Obsidian's `metadataCache` provides a `listItems` array where each item's `parent` field
is the line number of its parent (-1 for top-level). The plugin uses this to find children
without parsing markdown manually.

Key function: `isDescendantOf()` in `src/utils/listItems.ts` — recursively finds all descendants.

## TaskMarker Extensibility

When adding a new task state, edit only `src/utils/taskMarker.ts` — its file header lists
the four locations to update. `tasks.ts` re-exports everything, so callers that import
from `tasks.ts` need no import changes.

## Indentation Model

Indentation is handled as a *unit* (`'\t'` or N spaces), not a character count:

- `detectIndentUnit()` in `src/utils/indent.ts` infers a block's unit: tab if any
  leading tab exists, otherwise the smallest positive space indent.
- Transferred blocks are re-rendered in the **target file's** unit via
  `convertIndentUnit()` at insertion time (`insertMultipleUnderTargetHeading`,
  the dedup merge path, `insertUnderCollectorTask`, `insertBlockAfterHeading`).
  When the target has no indentation signal, the source unit is preserved; when
  extra nesting must be *added* and neither side has a signal, tabs are used
  (Obsidian's default).
- Children merged under an existing task are prefixed with that task's own
  leading whitespace, so hierarchy stays correct for nested matches.

Never hardcode `'  '` when building nested content — always go through these helpers.

## Transfer Command Ordering

All transfer commands, extract log, complete project task, and auto-move follow a strict
phase order: **collect (read-only) → write target via `vault.process` → mutate source.**
The source must never be modified before the target write succeeds; collected content
exists only in memory, so the old order could lose tasks on a failed write.

Invariants the auto-move extension (`src/events/autoMoveCompleted.ts`) must keep — each
prevents a specific data-loss or double-filing bug:

- Runs are serialized per editor view, and the awaited project write completes (or aborts
  the run) before anything moves.
- The trigger line is re-located after the await and matched by **text**; the Log pass
  needs the ticked line's text from the update listener, and bails when two identical
  lines make the tick unattributable.
- Auto-completion requires the completed task to carry its **own** project prefix at the
  root of the filed block — an ancestor collector or project bullet doesn't count.
- Idempotency comes from the log entry itself (`isCompletionLogged` — same task text,
  same source-note sub-heading), never from whether the project listed the task.

Rationale and worked cases: docs/specs/2026-08-05-auto-complete-project-tasks.md.

Children handling differs by command: migrate/push/pull/take leave completed/migrated
child subtrees in the source (`selectTransferableChildLines` in `src/utils/tasks.ts`);
extract log and complete project task move the whole subtree, and complete project task
folds leftover children of the removed Todo copy into the log entry, so terminal subtrees
left behind by take are never lost.

## Project Task Consolidation

Target-side insertion for project tasks (push/pull/migrate/take) goes through
`insertProjectTasksInSection` in `src/utils/projects.ts`, scoped to the target heading's
section. It always deduplicates first (alias-aware); collector grouping applies only when
the **target note's type** allows it — weekly/monthly/yearly targets group, daily targets
never do (daily tasks are worked out of order, so grouping would hide their individual
priorities). The command never decides this; the hop's target does — including
`takeProjectTask`, where the user picks the target period and the shape follows from it.

Rules that must survive any change here:

- Matching (`findProjectTaskMatch`, `findCollector`, `parseProjectPrefix`) is by
  link-target **basename**, never display text or resolved path.
- Consolidation never crosses a sub-heading boundary within the section
  (`findSliceRange`) and only folds top-level candidates — never a task nested under
  something else.
- A **selected collector line is decomposed, not moved verbatim**:
  `detectCollectorContext` + `getCollectorChildGroups` split it into individual project
  tasks carrying the collector's link, each routed through
  `insertProjectTasksInSection`; non-task children stay in the source. This applies to
  push/pull/migrate only — in `takeProjectTask`'s project-note source, a
  `Push [[Project]]`-shaped line has no collector meaning.

**Toggling the shape by hand.** `toggleCollectorTask` (`src/utils/collectorToggle.ts`)
is the manual override for the grouping flag's guess, and it is the one place
that *removes* a collector. It reuses the same primitives rather than a second
set of rules: grouping folds prefixed tasks through `findCollector` (reuse an
existing collector) or `groupUnderNewCollector` (create one), exactly as
insertion cases 2 and 3 do. What differs is scope, and all of it follows from
this being a manual reshape *within* one note rather than an automatic
transfer between two.

**Grouping acts on the selection, not the section.** Insertion-time
consolidation may sweep up every matching task it finds — it is converging the
section as a side effect of a transfer the user asked for. The toggle is the
gesture itself, so it obeys the gesture's extent: `selectedRoots` maps each
selected line to its top-level root (so selecting a task's note child selects
that task), and only matches in that set fold. A task for the same project
elsewhere in the section may be loose deliberately; sweeping it in would be the
command deciding something the user did not ask for. Ungrouping is the
exception — its unit is the whole collector, because its children are one group
by definition and hoisting half of them leaves the note in neither shape.

Two further rules differ from insertion. Terminal tasks participate: a
completed task is history the source keeps during a transfer, but leaving it
behind while its siblings regroup would split the group, so
`findPrefixedProjectTasks({ includeTerminal: true })` gathers it and ungrouping
hoists it. And the search range is the innermost heading-delimited slice around
the **target** (`findSliceRange` over the whole document), not a configured
target heading — the toggle works in any section of any note, including project
notes. Ungrouping keeps the non-task children where they are, under a collector
line that survives only to hold them; a collector left with nothing is removed.
Both directions require the collector or task to be at indent 0, because a
nested one has no unambiguous set of siblings to gather.

Full rationale and worked examples: docs/specs/2026-07-06-project-task-consolidation.md.
