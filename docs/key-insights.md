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

The `TaskState` enum and `TaskMarker` class live in `src/utils/taskMarker.ts`. The file
header lists all four locations that must be updated when adding a new task state:

1. `TaskState` enum — add the new state value
2. `TaskMarker.fromLine()` — add the character in the switch
3. `TaskMarker.isIncomplete()` — decide if the new state is "incomplete"
4. `TaskMarker.isTerminal()` — decide if the new state is terminal

`tasks.ts` re-exports everything from `taskMarker.ts`, so callers that import from `tasks.ts`
require no import changes. When adding a new state, edit only `taskMarker.ts`.

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

All transfer commands, extract log, and complete project task follow a strict
phase order: collect (read-only) → write target via `vault.process` → mutate
source. The source must never be modified before the target write succeeds;
collected content exists only in memory, so the old order could lose tasks on a
failed write.

Auto-move follows the same order when a ticked task turns out to be a project
task — in either section of the daily note: ticked in Todo it is filed to the
project and moved under Log, ticked where it already sits in Log only its notes
travel (`completeTriggerInProject` is one code path, parameterised by the
section heading). The Log pass needs the ticked line's **text** carried over
from the update listener: completed tasks accumulate there, so "first completed
in the section" — reliable in Todo, where auto-move files them immediately —
says nothing about which line the user just ticked, and two identical lines
make the tick unattributable, so the run bails. In both cases the project write
is awaited before anything moves, and a failed write aborts the run. Because that await happens inside an editor extension, two
things must hold that a synchronous run got for free — runs are serialized per
editor view (otherwise two quick completions both file the same task to the
project note), and the trigger line is re-located afterwards and matched by
text (otherwise an intervening edit could file the wrong task line-only,
dropping its children). Auto-completion is deliberately narrower than the
command: only a completed task carrying its **own** project prefix and sitting
at the root of the block being filed qualifies — an ancestor collector or
project bullet doesn't count, since the ticked line wouldn't be the task the
project note knows about. Whether the project ever listed the task is not a
condition either way: both paths log the completion, so ad-hoc daily-note work
reaches its project. What makes a completion idempotent is the log entry
itself (`isCompletionLogged` — same task text, same source-note sub-heading),
which is why the command's `[x]` waking the extension doesn't file the work
twice, and why the same task completed on another day still gets an entry.

Children handling differs by command: on migrate/push/pull/take,
completed/migrated child subtrees stay in the source
(`selectTransferableChildLines` in `src/utils/tasks.ts`); extract log and
complete project task move the whole subtree. Complete project task also folds
any leftover children of the removed Todo copy into the log entry, so terminal
subtrees left behind by take are never lost.

## Project Task Consolidation

Target-side insertion for project tasks (push/pull/migrate/take) goes through
`insertProjectTasksInSection` in `src/utils/projects.ts`, scoped to the
target heading's section. It always deduplicates first (alias-aware, matching
a task's own prefix or the collector it sits under), then — only when a
**collector-grouping flag** is enabled — appends under an existing collector,
consolidates loose prefixed siblings under a new one, or creates a collector
outright for a multi-task insert. Otherwise every task is appended
individually, prefixed with its project link.

The grouping flag derives from the **target note's type**, not the command:
weekly/monthly/yearly targets group, daily targets never do (daily tasks are
worked out of order and carry individual priorities, so grouping would hide
that). This is why `takeProjectTask` (always targets today's daily note) never
groups, `pullTaskUp` (never targets a daily note) always does, and
`pushTaskDown`/`migrateTask` switch per hop — migrate's daily→daily case (the
common one, every day but the last of the week) is the one place migration
touches a daily target.

Matching (`findProjectTaskMatch`, `findCollector`, `parseProjectPrefix`) is by
link-target **basename**, not display text or resolved path — the same
string-level convention `stripProjectPrefix` uses. Consolidation never crosses
a sub-heading boundary within the section (`findSliceRange`) and never touches
a task nested under something else — only top-level candidates are folded.

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

**Selecting a collector line itself is not a task transfer.** A collector
(`- [ ] Push [[Project]]`) is an ordinary incomplete task, so it can be the
line a user selects to push/pull/migrate. Moving it verbatim as one blob
would be wrong: an identical collector already in the target would match by
exact text and the generic children-merge would blindly concatenate
children with no per-child dedup. Instead, `detectCollectorContext` (checks
whether the *selected line itself* is a resolvable collector) plus
`getCollectorChildGroups` (splits its direct children into task groups vs.
non-task groups, skipping already-terminal subtrees exactly like
`selectTransferableChildLines` does for an ordinary task) decompose the
collector into individual project tasks — one per task child, carrying the
collector's own link — each routed through `insertProjectTasksInSection`
like any other project task. Non-task children (plain note bullets) have no
dedup identity and stay in the source, under the now-scheduled/migrated
collector line. This only applies to `pushTaskDown`, `pullTaskUp`, and
`migrateTask`; `takeProjectTask`'s source is always a project note, where a
`Push [[Project]]`-shaped line has no collector meaning.
