# Bullet Flow

An Obsidian plugin for BuJo-inspired knowledge management: extract logs from daily notes and migrate tasks between periodic notes.

## What This Is

**Bullet Flow** is a native Obsidian plugin that powers a lightweight workflow blending bullet journaling simplicity with digital searchability. It's designed to survive real-world chaos while supporting rapid context-switching and deep thinking.

**Key Features:**
- **Extract Log** — Move nested content from daily notes to project/area notes via wikilinks
- **Migrate Task** — BuJo-style task migration between periodic notes (daily/weekly/monthly/yearly)
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
- **`scripts/`** — Legacy Templater scripts (reference only)
- **`tests/`** — Comprehensive test suite (291 tests)

## Commands

### Extract Log

**Command:** `Bullet Flow: Extract log to linked note`

**Behavior:**
- Place cursor on a bullet containing a `[[wikilink]]`
- Extracts all children to the linked note under a `## Log` heading
- Creates a back-link to the daily note with timestamp
- Copies extracted content to clipboard
- Handles pure link bullets (inherits context from parent)
- Supports section links: `[[Note#Section]]`

**Example:**
```
- Project meeting notes [[Project Alpha]]
  - Decided on MVP scope
  - Next milestone: Feb 15
```

After extraction, the linked note `Project Alpha` gets:
```markdown
## Log

- 2026-01-25 Sat - Project meeting notes
  - Decided on MVP scope
  - Next milestone: Feb 15
```

### Migrate Task

**Command:** `Bullet Flow: Migrate task to next note`

**Behavior:**
- Place cursor on an incomplete task (`- [ ]` or `- [/]`), or select multiple lines
- Marks the task(s) as migrated (`- [>]`)
- Copies task(s) and children to the next note under `## Log` (started tasks reset to `- [ ]`)
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

After migration from Sunday (2026-01-25):
- Source (daily): `- [>] Write documentation` (children removed)
- Target (weekly 2026-01-W05): Full task tree under `## Log`

## Workflow Overview

The system is built on these principles: frictionless capture, continuous reflection, resilience under stress, and findability without maintenance. Everything starts in the daily note as a rapid log; reflection passes transform messy logs into durable knowledge through extraction and migration.

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
- **Vitest** — Testing framework with 291 tests
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

Comprehensive test suite with 291 tests covering all functionality:

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
- Unit tests for utilities (95%+ coverage)
- Integration tests with markdown-first pattern
- Full Obsidian API mocks
- See [TESTING.md](TESTING.md) for details

### Project Structure

```
obsidian-tools/
├── src/               # TypeScript plugin source
│   ├── main.ts        # Plugin entry point
│   ├── commands/      # extractLog, migrateTask
│   └── utils/         # Shared utilities
├── tests/             # Test suite (291 tests)
│   ├── unit/          # Pure function tests
│   ├── integration/   # Full workflow tests
│   ├── helpers/       # Test utilities
│   └── mocks/         # Obsidian API mocks
├── scripts/           # Legacy Templater scripts (reference)
└── docs/              # Documentation
```

### Auto-Deploy

Every push to `main` or `claude/**` branches triggers:
1. Version bump in manifest.json
2. Build and bundle via esbuild
3. GitHub release creation
4. BRAT auto-update for all users

See [docs/AUTO-DEPLOY.md](docs/AUTO-DEPLOY.md) for details.
