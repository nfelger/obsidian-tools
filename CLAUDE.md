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
│   ├── config.ts                 # Task marker patterns & constants
│   ├── settings.ts               # Plugin settings tab
│   ├── commands/                 # One file per command
│   │   ├── extractLog.ts
│   │   ├── migrateTask.ts
│   │   ├── pushTaskDown.ts
│   │   ├── pullTaskUp.ts
│   │   ├── takeProjectTask.ts
│   │   └── dropTaskToProject.ts
│   ├── events/
│   │   └── autoMoveCompleted.ts  # CM6 extension for auto-move
│   ├── ui/
│   │   └── HotkeyModal.ts       # Leader-key hotkey modal
│   └── utils/                    # Domain services & pure functions
│       ├── commandSetup.ts       # Common command setup
│       ├── tasks.ts              # TaskState enum + TaskMarker class
│       ├── periodicNotes.ts      # PeriodicNoteService
│       ├── wikilinks.ts          # LinkResolver + wikilink parsing
│       ├── listItems.ts          # List item operations
│       ├── indent.ts             # Indentation utilities
│       ├── projects.ts           # Project note detection
│       └── autoMove.ts           # Auto-move computation logic
├── tests/
│   ├── unit/                     # Pure function tests
│   ├── integration/              # Full workflow tests
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
❌ Add frontmatter, create Dataview blocks, store state outside markdown

## Key APIs and Architecture

**Obsidian APIs used:**
- `this.app.vault` — file operations
- `this.app.workspace` — navigate, get active view/editor
- `this.app.metadataCache` — list item metadata
- `Notice` — user notifications

**Domain patterns — use these, don't bypass:**
- `TaskMarker` (`src/utils/tasks.ts`) — type-safe task state transitions; never manipulate
  task markers as raw strings
- `PeriodicNoteService` (`src/utils/periodicNotes.ts`) — encapsulates settings for periodic
  note operations; no parameter threading
- `LinkResolver` interface (`src/types.ts`) — keeps Obsidian types out of domain logic;
  use `ObsidianLinkResolver` as the infrastructure adapter

**Task state machine:**
```
[ ] (Open)   ─┬─ migrateTask ─→ [>] (Migrated) [terminal]
[/] (Started) │
              ├─ pushDown/pullUp ─→ [<] (Scheduled) ─→ merge ─→ [ ] (Open)
              └─ complete ─→ [x] (Completed) [terminal]
```

**Target heading settings** — four independent settings controlling where content is inserted:

| Setting | Used by | Target note type | Default |
|---|---|---|---|
| `periodicNoteTaskTargetHeading` | migrateTask, pushTaskDown, pullTaskUp, takeProjectTask, autoMove (source) | Periodic notes | `## Log` |
| `logExtractionTargetHeading` | extractLog | Project/Area notes | `## Log` |
| `projectNoteTaskTargetHeading` | dropTaskToProject | Project notes | `## Todo` |
| `dailyNoteLogHeading` | autoMove (destination) | Daily notes | `## Log` |

For periodic note edge cases (ISO weeks, wikilink parsing, list hierarchy): @docs/key-insights.md

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode (TDD)
npm run test:coverage # Coverage report
```

Write tests first. See @tests/CLAUDE.md for patterns and mock API reference.

## Code Conventions

**NEVER add planning comments to committed code.** TODO, FIXME, MVP, Slice references
belong in GitHub issues and PR descriptions — not in source files.

**NEVER include statistics in documentation.** Line counts, test counts, and coverage
percentages go out of date immediately. Describe *what*, not *how many*.

**Expose Obsidian types only at the boundary.** Domain interfaces (like `LinkResolver`)
must not reference `TFile` or other Obsidian types — use the adapter pattern.

**All shared types live in `src/types.ts`.** Import with `import type { TypeName } from '../types'`.

## Documentation: CHANGELOG

When writing CHANGELOG entries, ask: "Would a user care about this?" Write what users
experience, not what changed internally.

❌ "Ported 46 legacy unit tests", "Updated main.ts (44 insertions)", "Created periodicNotes.ts"
✅ "Multi-select task migration", "Better mobile support", "Handles YAML frontmatter"

## Releasing a New Version

**CRITICAL: Update CHANGELOG.md before bumping versions.** Then bump in all three files
in a single commit: `manifest.json`, `package.json`, `versions.json`.

## Adding a New Command

1. Create `src/commands/newCommand.ts`
2. Add types to `src/types.ts` if needed
3. Write unit tests in `tests/unit/`
4. Write integration tests in `tests/integration/`
5. Register in `src/main.ts` via `this.addCommand(...)`

Every command follows this structure:

```typescript
export async function newCommand(plugin: BulletFlowPlugin): Promise<void> {
  try {
    const context = getActiveMarkdownFile(plugin);
    if (!context) return;
    const { editor, file } = context;
    // implementation
    new Notice('newCommand: Success!');
  } catch (e) {
    new Notice(`newCommand ERROR: ${e.message}`);
    console.error('newCommand error:', e);
  }
}
```
