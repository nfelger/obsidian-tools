# Changelog

All notable changes to Bullet Flow are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-01-27

### Added

**Push Task Down**
- New command to schedule tasks to lower-level periodic notes
- Push from yearly → current month, monthly → current week, weekly → today
- Marks source tasks with `[<]` (scheduled marker)
- Supports multi-select: push multiple tasks at once
- Children move with their parent task

## [0.3.2] - 2026-01-26

### Fixed

- Custom checkbox styles (`[o]` meeting marker) now included in releases

## [0.3.1] - 2026-01-26

### Improved

- Updated CHANGELOG with missing 0.3.0 release notes

## [0.3.0] - 2026-01-26

### Added

**Plugin Settings**
- Configurable diary folder name (default: `+Diary`)
- Configurable target section heading for Extract Log (default: `## Log`)
- Customizable periodic note path patterns using moment.js format tokens
- Compatible with the Periodic Notes community plugin

### Improved

- Folder picker with autocomplete in settings
- Custom checkbox CSS now loads automatically via `styles.css`

## [0.2.0] - 2026-01-25

### Added

**Task Migration**
- Multi-select task migration: Select multiple tasks and migrate them all at once
- Support for all periodic note types: daily, weekly, monthly, and yearly notes
- Smart boundary transitions: Sunday automatically migrates to next week, December to next year
- Task migration now works on mobile devices with touch selection

**Extract Log**
- Section link support: Extract to specific sections like `[[Note#Section]]`
- Smart context: Bullets that are pure links inherit context from their parent
- Automatic back-links: Extracted content includes timestamp and link back to source
- Clipboard copy: Extracted content is automatically copied for easy pasting

**Custom Checkboxes**
- Custom checkbox CSS now works automatically (no manual setup needed)
- Meeting marker `[o]` displays with red calendar icon

**Auto-Update**
- Plugin updates automatically via BRAT
- No manual file copying or installation required

### Improved

- Better mobile support for text selection
- Handles YAML frontmatter when inserting content
- Automatic next note calculation for all note types

### Changed

- Now a native Obsidian plugin (previously Templater user scripts)
- Automatic installation and updates via BRAT

## [0.1.0] - 2026-01-23

Initial release as Templater user scripts.

### Added
- Extract Log: Move nested content from daily notes to project/area notes
- Migrate Task: BuJo-style task migration between periodic notes
- Folder selection for new notes
