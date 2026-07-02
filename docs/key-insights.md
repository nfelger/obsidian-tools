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
  the dedup merge path, `insertUnderCollectorTask`). When the target has no
  indentation signal, the source unit is preserved; when extra nesting must be
  *added* and neither side has a signal, tabs are used (Obsidian's default).
- Children merged under an existing task are prefixed with that task's own
  leading whitespace, so hierarchy stays correct for nested matches.

Never hardcode `'  '` when building nested content — always go through these helpers.

## Transfer Command Ordering

All transfer commands and extract log follow a strict phase order: collect
(read-only) → write target via `vault.process` → mutate source. The source must
never be modified before the target write succeeds; collected content exists only
in memory, so the old order could lose tasks on a failed write. Completed/migrated
child subtrees stay in the source (`selectTransferableChildLines` in
`src/utils/tasks.ts`).
