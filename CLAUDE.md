# CLAUDE.md - Bullet Flow Plugin

**Bullet Flow** is an Obsidian plugin supporting a BuJo-inspired (Bullet Journal) workflow.
Commands transform text between notes to support a chaos → structure daily workflow.

Before suggesting workflow or feature changes, read [WORKFLOW.md](WORKFLOW.md).

## Codebase Structure

```
obsidian-tools/
├── src/
│   ├── main.ts                   # Plugin entry point — register commands here
│   ├── types.ts                  # All shared types — add new types here
│   ├── config.ts                 # Notice timeouts & hotkey bindings
│   ├── settings.ts               # Plugin settings tab
│   ├── vendor.ts                 # Obsidian's re-exported moment (see layering below)
│   ├── commands/                 # One file per command
│   │   ├── extractLog.ts
│   │   ├── migrateTask.ts
│   │   ├── pushTaskDown.ts
│   │   ├── pullTaskUp.ts
│   │   ├── takeProjectTask.ts
│   │   ├── dropTaskToProject.ts
│   │   ├── completeProjectTask.ts
│   │   └── finishProject.ts
│   ├── events/
│   │   └── autoMoveCompleted.ts  # CM6 extension for auto-move (+ auto project completion)
│   ├── ui/
│   │   └── HotkeyModal.ts       # Leader-key hotkey modal
│   ├── adapters/                 # Obsidian API lives here, and only here
│   │   ├── commandSetup.ts       # Active view, editor, vault, notices
│   │   ├── periodicNoteCreator.ts # Daily Notes / Periodic Notes plugin boundary
│   │   └── projectCompletion.ts  # Project-note side of completing a task
│   └── utils/                    # Domain services & pure functions
│       ├── taskMarker.ts         # TaskState enum + TaskMarker class
│       ├── tasks.ts              # Task utilities; re-exports from taskMarker.ts
│       ├── periodicNotes.ts      # PeriodicNoteService (paths, week math)
│       ├── wikilinks.ts          # LinkResolver + wikilink parsing
│       ├── listItems.ts          # List item operations
│       ├── indent.ts             # Indentation utilities
│       ├── projects.ts           # Project note detection
│       ├── autoMove.ts           # Auto-move computation logic
│       └── notices.ts            # Shared transfer-command notice text
├── tests/
│   ├── unit/                     # Pure function tests
│   ├── integration/              # Full workflow tests
│   ├── e2e/                      # End-to-end tests (wdio-obsidian-service)
│   ├── helpers/                  # Test helper factories
│   ├── mocks/obsidian.js         # Obsidian API mock factories
│   └── legacy/                   # Legacy Templater script tests
├── docs/
├── manifest.json                 # Plugin metadata (bump version here)
├── package.json                  # Bump version here too
└── versions.json                 # Bump version here too
```

## Core Design Principle

**Every operation is a direct text transformation.** The markdown file *is* the state —
no hidden metadata, no query layers, no computed views.

When reviewing feature suggestions, ask: could a user understand this file's history using
only a plain text editor? If a change requires Obsidian or the plugin to interpret meaning
correctly, flag it as a violation of this principle.

✅ Move/copy text between files, leave visible state markers (`[>]` migrated, `[<]` scheduled),
use wikilinks as the paper trail
❌ Create Dataview blocks or tasks queries, store state outside markdown

## Key APIs and Architecture

**Obsidian APIs used:**
- `this.app.vault` — file operations
- `this.app.workspace` — navigate, get active view/editor
- `this.app.metadataCache` — list item metadata
- `this.app.fileManager` — rename/move files (updates wikilinks)
- `Notice` — user notifications

**Domain patterns — use these, don't bypass:**
- `TaskMarker` (`src/utils/taskMarker.ts`) — type-safe task state transitions; never manipulate
  task markers as raw strings. See @docs/key-insights.md for extensibility guide.
- `PeriodicNoteService` (`src/utils/periodicNotes.ts`) — periodic note paths and week math;
  construct with `getPeriodicConfig()` (`src/adapters/periodicNoteCreator.ts`), which resolves
  folder/format per granularity from the Daily Notes / Periodic Notes plugins
- `LinkResolver` interface (`src/types.ts`) — keeps Obsidian types out of domain logic;
  use `ObsidianLinkResolver` as the infrastructure adapter

**Task state machine:**
```
[ ] (Open)    ─┬─ migrateTask ──→ [>] (Migrated)  [terminal]
               ├─ pushDown/pullUp → [<] (Scheduled) ─→ merge ─→ [ ] (Open)
               └─ complete ──────→ [x] (Completed) [terminal]

[/] (Started) ─┬─ migrateTask ──→ [>] (Migrated)  [terminal]
               ├─ pushDown/pullUp → [<] (Scheduled) ─→ merge ─→ [ ] (Open)
               └─ complete ──────→ [x] (Completed) [terminal]
```

**Target heading settings** — four independent settings controlling where content is inserted:

| Setting | Used by | Target note type | Default |
|---|---|---|---|
| `periodicNoteTaskTargetHeading` | migrateTask, pushTaskDown, pullTaskUp, takeProjectTask, autoMove (source) | Periodic notes | `## Todo` |
| `logExtractionTargetHeading` | extractLog, completeProjectTask, autoMove (project log) | Project/Area notes | `## Log` |
| `projectNoteTaskTargetHeading` | dropTaskToProject, completeProjectTask, autoMove (Todo copy) | Project notes | `## Todo` |
| `dailyNoteLogHeading` | autoMove (destination, and source for a task ticked there) | Daily notes | `## Log` |

For periodic note edge cases (ISO weeks, wikilink parsing, list hierarchy): @docs/key-insights.md

## Testing and Linting

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode (TDD)
npm run test:coverage # Coverage report (fails below the floor in vitest.config.js)
npm run lint          # Errors block; complexity/size limits are advisory warnings
npm run lint:guided   # Same findings, each with how to fix it
npm run audit:code    # Dead code, duplication, complexity — only what this change adds
```

Write tests first. See @tests/CLAUDE.md for patterns and mock API reference.

Lint and tests also run automatically before a turn can end (`.claude/hooks/`). That is a
backstop, not a substitute for running them as you work.

## Code Conventions

**NEVER add planning comments to committed code.** TODO, FIXME, MVP, Slice references
belong in GitHub issues and PR descriptions — not in source files.

**NEVER include statistics in documentation.** Line counts, test counts, and coverage
percentages go out of date immediately. Describe *what*, not *how many*.

**Call the Obsidian API only from `src/adapters/`.** Domain code under `src/utils/` may
*name* Obsidian types (`import type { TFile }`) but must never import a value from
`obsidian` — take a narrow interface instead, as `LinkResolver` (`src/types.ts`) does, or do
the call in an adapter and pass the result in. Obsidian's vendored `moment` comes from
`src/vendor.ts`, which is library access rather than a boundary crossing. Both halves are
enforced: `no-restricted-imports` in `.oxlintrc.json` for the API, `boundaries` in
`.fallowrc.json` for import direction and for keeping new files inside the layering.

**All shared types live in `src/types.ts`.** Import with `import type { TypeName } from '../types'`.
Exception: the task state machine types (`TaskState`, `TaskMatch`) live with their logic in
`src/utils/taskMarker.ts` and are re-exported through `src/utils/tasks.ts`.

**Quality limits only tighten.** The lint warning thresholds (`.oxlintrc.json`) and the
coverage floor (`vitest.config.js`) record where the code is today: raise them as it
improves, never relax them to make a run pass. If a finding genuinely can't be refactored,
suppress that one line with a `-- reason` rather than loosening the limit for everything.
Advisory warnings are a backlog, not a to-do list — don't clear them alongside unrelated
work. Rationale and the remaining roadmap:
[docs/specs/2026-08-06-maintainability-sensors.md](docs/specs/2026-08-06-maintainability-sensors.md).

## Documentation: CHANGELOG

When writing CHANGELOG entries, ask: "Would a user care about this?" Write what users
experience, not what changed internally.

❌ "Ported 46 legacy unit tests", "Updated main.ts (44 insertions)", "Created periodicNotes.ts"
✅ "Multi-select task migration", "Better mobile support", "Handles YAML frontmatter"

## Releasing a New Version

Use the `cut-release` skill. It handles CHANGELOG promotion, version bumps across all three
files (`manifest.json`, `package.json`, `versions.json`), and the push to main in one atomic
commit. CI publishes the GitHub release automatically.

## Plans and Specs

Design specs live in `docs/specs/`, implementation plans in `docs/plans/`, both named
`YYYY-MM-DD-<topic>.md`.

## Adding a New Command

1. Create `src/commands/newCommand.ts` — follow the structure of any existing command
2. Add types to `src/types.ts` if needed
3. Write unit tests in `tests/unit/`
4. Write integration tests in `tests/integration/`
5. Register in `src/main.ts` via `this.addCommand(...)`
