# Obsidian Tools

Tools, scripts, and plugins for my Obsidian vault and BuJo-inspired workflow.

## What This Is

This repository collects the technical components that power my Obsidian knowledge management system:
- Custom scripts for extraction and migration
- Code snippets and CSS customizations
- Helper utilities and automation
- Future plugins (as they're developed)

The workflow itself blends bullet journaling simplicity with digital searchability — a lightweight system designed to survive real-world chaos while supporting rapid context-switching and deep thinking.

## Repository Contents

- **`scripts/`** — Templater user scripts
- **`snippets/`** — CSS customizations

## Scripts

### extractLog.js

Extracts nested content from daily notes to project/area notes.

**Usage:** `<% tp.user.extractLog.extractLog(tp) %>`

**Behavior:**
- Place cursor on a bullet containing a `[[wikilink]]`
- Extracts all children to the linked note under a `## Log` heading
- Creates a back-link to the daily note
- Copies extracted content to clipboard

### migrateTask.js

Migrates incomplete tasks to the next periodic note (BuJo-style migration).

**Usage:** `<% tp.user.migrateTask.migrateTask(tp) %>`

**Behavior:**
- Place cursor on an incomplete task (`- [ ]` or `- [/]`), or select multiple lines
- Marks the task(s) as migrated (`- [>]`)
- Copies task(s) and children to the next note under `## Log` (started tasks reset to `- [ ]`)
- Automatically determines target based on note type:
  - Daily (Mon-Sat) → next daily
  - Daily (Sunday) → next weekly
  - Weekly → next weekly
  - Monthly (Jan-Nov) → next monthly
  - Monthly (December) → next yearly
  - Yearly → next yearly

**Multi-select:** When text is selected, migrates all top-level incomplete tasks within the selection. Nested child tasks are included with their parents but are not treated as separate migrations.

### handleNewNote.js

Prompts for folder selection when creating new notes.

**Usage:** `<% tp.user.handleNewNote.handleNewNote(tp) %>`

**Behavior:**
- Displays folder picker with vault folders
- Moves the new note to the selected folder

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

**Obsidian Plugins:**
- **Periodic Notes** — Auto-generates daily/weekly/monthly/yearly notes
- **Minimal Theme** — Semantic bullets and visual markers
- **Calendar Plugin** — Provides navigation for period notes; highlights notes with unhandled tasks
- **Templater** — Note templates and user scripts
- **Dataview** — Queries and summaries

**Development:**
- **Vitest** — Testing framework for user scripts
- **Node.js** — Development environment

## Development

### Testing

This repository includes comprehensive tests for all Templater user scripts.

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Watch mode (re-run on file changes)
npm run test:watch

# Coverage report
npm run test:coverage

# Interactive UI
npm run test:ui
```

**Testing approach:**
- Unit tests for pure helper functions (95%+ coverage)
- Integration tests with markdown-first approach for main workflows
- Mock factories for Obsidian APIs
- See [TESTING.md](TESTING.md) for full documentation

### Project Structure

```
obsidian-tools/
├── scripts/           # Templater user scripts
├── snippets/          # CSS customizations
├── tests/             # Test suite
└── docs/              # Documentation
```
