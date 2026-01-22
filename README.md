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
