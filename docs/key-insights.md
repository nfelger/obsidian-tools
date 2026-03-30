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
- Daily (Sunday) → next Weekly
- Weekly → always next Weekly
- Monthly (December) → next Yearly
- Yearly → always next Yearly

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
header lists all five locations that must be updated when adding a new task state:

1. `TaskState` enum — add the new state value
2. `TaskMarker.fromLine()` — add the character in the switch
3. `TaskMarker.isIncomplete()` — decide if the new state is "incomplete"
4. `TaskMarker.isTerminal()` — decide if the new state is terminal
5. `canMigrate()` / `canReopen()` — if the new state participates in those transitions

`tasks.ts` re-exports everything from `taskMarker.ts`, so callers that import from `tasks.ts`
require no import changes. When adding a new state, edit only `taskMarker.ts`.
