# Bullet Flow

An Obsidian plugin for BuJo-inspired knowledge management: extract logs from daily notes and migrate tasks between periodic notes.

## What This Is

**Bullet Flow** is a native Obsidian plugin that powers a lightweight workflow blending bullet journaling simplicity with digital searchability. It's designed to survive real-world chaos while supporting rapid context-switching and deep thinking.

**Key Features:**
- **Extract Log** — Move nested content from daily notes to project/area notes via wikilinks
- **Migrate Task** — BuJo-style task migration between periodic notes (daily/weekly/monthly/yearly)
- **Auto-Move Completed** — Completed tasks in daily notes automatically move from Todo to Log, and project tasks are completed in their project note on the way
- **Custom Checkboxes** — Visual task markers (e.g., `[o]` for meetings) injected automatically

## Installation

### Via BRAT (Beta Reviewers Auto-update Tester)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat)
2. Open BRAT settings: **Add Beta Plugin**
3. Enter: `nfelger/obsidian-tools`
4. Enable **Bullet Flow** in Community Plugins

BRAT will automatically update the plugin whenever new versions are released.

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/nfelger/obsidian-tools/releases)
2. Create folder: `{vault}/.obsidian/plugins/bullet-flow/`
3. Copy files to the folder
4. Enable **Bullet Flow** in Community Plugins

## Repository Contents

- **`src/`** — TypeScript plugin source code
- **`tests/`** — Comprehensive test suite

## Commands

### Extract Log

**Command:** `Bullet Flow: Extract log to linked note`

**Behavior:**
- Place cursor on a bullet containing a `[[wikilink]]`
- Extracts all children to the linked note under a `## Log` heading (configurable),
  beneath a sub-heading that links back to the daily note
- Rewrites the source wikilink to point at the new section (visible text unchanged)
- Copies extracted content to clipboard
- Handles pure link bullets (inherits context from parent)
- Supports section links: `[[Note#Section]]`

**Example:**
```
- [[Project Alpha]] meeting notes
  - Decided on MVP scope
  - Next milestone: Feb 15
```

After extraction (from daily note `2026-01-25 Sat`), the linked note `Project Alpha` gets:
```markdown
## Log

### [[2026-01-25 Sat]] meeting notes

- Decided on MVP scope
- Next milestone: Feb 15
```

and the source bullet becomes `- [[Project Alpha#2026-01-25 Sat meeting notes|Project Alpha]] meeting notes`.

### Migrate Task

**Command:** `Bullet Flow: Migrate task to next note`

**Behavior:**
- Place cursor on an incomplete task (`- [ ]` or `- [/]`), or select multiple lines
- Marks the task(s) as migrated (`- [>]`)
- Copies task(s) and their incomplete children to the next note under `## Todo`
  (configurable; started tasks reset to `- [ ]`). Completed or already-migrated
  children stay behind in the source note as the day's record.
- Automatically determines target based on note type and boundaries:
  - Daily (Mon-Sat) → next daily
  - Daily (Sunday) → next weekly
  - Weekly → next weekly
  - Monthly (Jan-Nov) → next monthly
  - Monthly (December) → next yearly
  - Yearly → next yearly

**Multi-select:** When text is selected, migrates all top-level incomplete tasks within the selection. Child tasks are included with their parents automatically.

**Example:**
```
- [ ] Write documentation
  - [ ] Update README
  - [ ] Create CHANGELOG
```

After migrating from Sunday (2026-01-25):
- Source (daily): `- [>] Write documentation` (incomplete children removed)
- Target (weekly 2026-01-W05): Full task tree under `## Todo`

### Take Project Task

**Command:** `Bullet Flow: Take project task to periodic note`

Pulls a task out of a project note and puts it on a time horizon: today, this
week, this month or this year.

**Behavior:**
- Place cursor on an incomplete task in a project note, or select multiple lines
- A picker asks which period the task is for, showing the note each one would
  write to — press `d`, `w`, `m` or `y`, or click. Dismiss it (Escape) and
  nothing is written.
- Copies the task(s) to that note under `## Todo` (configurable), carrying a
  `[[Project]]` link so the task keeps its context
- Marks the source task(s) as scheduled (`- [<]`) and moves their children along
- An existing copy of the task in the target note is reopened and merged into
  rather than duplicated
- Weekly, monthly and yearly notes gather the project's tasks under a collector
  (`- [ ] Push [[Project]]`); daily notes list them individually, because a day's
  tasks are worked out of order

**Example:** taking two tasks from `Migration Initiative` to this week's note:
```
- [ ] Push [[Migration Initiative]]
	- [ ] Define rollback strategy
	- [ ] Get sign-off from security team
```

Taking one of them to today instead:
```
- [ ] [[Migration Initiative]] Define rollback strategy
```

### Toggle Collector Task Grouping

**Command:** `Bullet Flow: Toggle collector task grouping`

A project's tasks live in one of two shapes: gathered under a *collector*
(`- [ ] Push [[Project]]`, tasks nested beneath it) or listed individually with
the project link on each. Commands that bring tasks into a note pick the shape
from the note's type — collectors in weekly, monthly and yearly notes, separate
tasks in daily notes. This command switches between them by hand.

**Behavior:**
- Cursor on a task carrying a project link → that task folds under a collector,
  prefix stripped. **Select more lines to fold more tasks** — only what you
  select moves, so a task for the same project left loose elsewhere stays loose.
  An existing collector is reused rather than a second one created.
- Cursor anywhere inside a collector's block → its tasks move up to the top
  level, each carrying the collector's link (alias included). Notes that aren't
  tasks stay behind under the collector, which stays with them. Ungrouping
  always takes the whole collector; half a group is neither shape.
- Sub-tasks and notes travel with their task, and completed or migrated tasks
  stay with the group rather than being left behind.
- Tasks never move across a heading, so a `### Later` sub-section keeps its own.

**Example:**
```
- [ ] [[Migration Initiative]] Ask Samir for cost estimates
- [ ] Book the retro
- [ ] [[Migration Initiative|MI]] Draft the rollback plan
```

Selecting both project tasks:
```
- [ ] Push [[Migration Initiative|MI]]
	- [ ] Ask Samir for cost estimates
	- [ ] Draft the rollback plan
- [ ] Book the retro
```

Running it again from inside the group restores the first shape.

**Multi-select:** When text is selected, groups the top-level project tasks
within the selection — reaching a task through any of its children. With no
selection, only the task at the cursor is grouped.

## Workflow Overview

The system is built on these principles: frictionless capture, continuous reflection, resilience under stress, and findability without maintenance. Everything starts in the daily note as a rapid log; reflection passes transform messy logs into durable knowledge through extraction and migration.

### Design Philosophy

Bullet Flow aligns with Obsidian's principle that *your knowledge should last*. Every operation transforms your markdown directly—there are no queries, no computed views, no hidden metadata. When you migrate a task, the text moves. When you extract a log, the content relocates.

This follows Workflow Principle #8: **Text over Logic**. If you opened these files in any text editor ten years from now, you'd understand exactly what happened—no Obsidian required.

**For the full workflow documentation**, see [WORKFLOW.md](WORKFLOW.md).

Key concepts:
- **Daily Note** — Single capture space; everything flows into one bulleted log
- **Extraction** — Moving content from daily logs into Projects/Areas when it has lasting value
- **Migration** — BuJo-style practice of moving tasks forward or explicitly dropping them
- **PARA-lite** — Simplified organization around Projects (time-bound) and Areas (ongoing)

## Vault Structure

The vault uses a minimal folder organization:
- **`+Diary/`** — Daily, weekly, monthly, yearly notes
- **`1 Projekte/`** — Time-bound initiatives
- **`2 Areas/`** — Ongoing responsibilities
- **`3 Ressourcen/`** — Timeless resources
- **`4 Archive/`** — Completed projects and old notes

### Periodic Note Formats

All periodic notes live under `+Diary/` with a nested folder structure:

| Type | Path Format | Example |
|------|-------------|---------|
| Daily | `YYYY/MM/YYYY-MM-DD ddd.md` | `2026/01/2026-01-22 Thu.md` |
| Weekly | `YYYY/MM/YYYY-MM-Www.md` | `2026/01/2026-01-W04.md` |
| Monthly | `YYYY/YYYY-MM mmm.md` | `2026/2026-01 Jan.md` |
| Yearly | `YYYY/YYYY.md` | `2026/2026.md` |

## Tech Stack

**Plugin:**
- **TypeScript** — Type-safe plugin development
- **Obsidian API** — Full access to vault, editor, metadata cache
- **esbuild** — Fast compilation and bundling

**Recommended Obsidian Plugins:**
- **Periodic Notes** — Auto-generates daily/weekly/monthly/yearly notes
- **Calendar** — Navigation for periodic notes
- **Dataview** — Queries and summaries
- **Minimal Theme** — Enhanced visual markers (optional)

**Development:**
- **Vitest** — Testing framework
- **TypeScript 5.3+** — Strict type checking
- **GitHub Actions** — Automated releases via BRAT

## Development

### Building the Plugin

```bash
# Install dependencies
npm install

# Build plugin (outputs to main.js)
npm run build

# Development build with watch mode
npm run dev
```

### Testing

Comprehensive test suite covering all functionality:

```bash
# Run all tests
npm test

# Watch mode (TDD)
npm run test:watch

# Coverage report
npm run test:coverage

# Interactive UI
npm run test:ui
```

**Testing approach:**
- Unit tests for utilities
- Integration tests with markdown-first pattern
- Full Obsidian API mocks
- See [tests/CLAUDE.md](tests/CLAUDE.md) for details

### Project Structure

```
obsidian-tools/
├── src/               # TypeScript plugin source
│   ├── main.ts        # Plugin entry point
│   ├── commands/      # One file per command
│   └── utils/         # Shared utilities
├── tests/             # Test suite
│   ├── unit/          # Pure function tests
│   ├── integration/   # Full workflow tests
│   ├── helpers/       # Test utilities
│   └── mocks/         # Obsidian API mocks
└── docs/              # Documentation
```

### Auto-Deploy

Every push to `main` or `claude/**` branches triggers:
1. Version bump in manifest.json
2. Build and bundle via esbuild
3. GitHub release creation
4. BRAT auto-update for all users

See [docs/AUTO-DEPLOY.md](docs/AUTO-DEPLOY.md) for details.
