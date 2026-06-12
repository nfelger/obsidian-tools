# Changelog

All notable changes to Bullet Flow are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.12.0] - 2026-06-12

### Added

- Target notes are created automatically: migrating, pushing, pulling, or taking
  a task no longer fails when tomorrow's (or the target period's) note doesn't
  exist yet — the note and its folders are created on the fly, with the template
  configured in Daily Notes / Periodic Notes applied
- Taking several project tasks at once groups them under a single
  `Push [[Project]]` collector bullet instead of repeating the project link on
  every task
- Migrating a task that sits indented under a project bullet prepends the
  project wikilink, so the task keeps its context in the target note
- Extract log headings now include the text before the wikilink, so bullets
  like "Checkin mit Chris zu [[Project]]" keep their meaning

### Fixed

- Weekly notes using locale weeks (`ww` formats, Sunday-start) now work
  correctly: the week number is read from the filename, and pull up targets
  the month containing the week's first day (previously a `2026-05-W23` note
  could land in April), next/previous week and period checks follow the same
  week system
- Moving tasks no longer mixes tabs and spaces — transferred content is re-rendered
  in the target note's own indentation style, fixing glitchy indent guides
- Pulling a task up into a note where it already exists nested under another task
  now places merged children correctly under that task
- Custom section headings containing characters like `(`, `)`, or `+` are now found
  instead of being duplicated on every insertion
- If writing to the target note fails, the source note is left untouched — commands
  no longer mark tasks as moved (or delete them) before the move has succeeded
- Vaults configured before 0.11.1 now pick up the `## Todo` task heading default;
  pull up / push down / migrate no longer land in `## Log`
- Selecting tasks with multiple cursors now moves tasks from every selection,
  not just the first
- Auto-move no longer risks acting on the wrong note when switching panes right
  after completing a task

### Changed

- Note locations are now read directly from the Daily Notes / Periodic Notes
  plugins: the diary folder and filename pattern settings are gone from Bullet
  Flow — configure folder, format, and template in Periodic Notes and Bullet
  Flow follows
- Migrating, pushing, pulling, or taking a task now moves only its incomplete
  children; completed sub-tasks stay in the source note as the day's record
- Notices now show readable command names ("Migrate task: …") instead of internal
  identifiers ("migrateTask: …")

## [0.11.1] - 2026-04-01

### Fixed

- Auto-move hang when completing tasks in complex notes with many headings and task types — the plugin no longer requires an Obsidian restart after completing a task
- Finish Project no longer modifies file content if the archive folder cannot be created

### Changed

- Migrate, Push Down, Pull Up, and Take Project Task now insert tasks under `## Todo` by default (was `## Log`). Users with saved settings are unaffected.

### Improved

- `npm test` now auto-installs dependencies if `node_modules` is missing, so a fresh checkout works without a separate `npm install` step

## [0.11.0] - 2026-02-18

### Added

- New **Finish project** command: marks a project as completed by adding a `completed` date to frontmatter, renaming it with a checkmark prefix, and moving it to the archive folder
- New **Project archive folder** setting to configure where finished projects are moved (default: `4 Archive`)
- Finish project hotkey (`f`) in the command menu

## [0.10.4] - 2026-02-18

### Improved

- Task marker operations use type-safe `TaskMarker` API throughout all commands
- Removed deprecated `WikiLink` type — `types.ts` no longer depends on Obsidian internals

## [0.10.3] - 2026-02-18

### Fixed

- Error logging in all commands now uses `console.error` instead of `console.log`

## [0.10.2] - 2026-02-13

### Fixed

- "Take task from project" no longer prepends `[[Project]]` when nesting the task under a collector (e.g. `- [ ] Push [[Project]]`). The collector already identifies the project, so the extra link was noise.

## [0.10.1] - 2026-02-11

### Changed

- Extract Log hotkey changed from `e` to `x` in the hotkey menu

## [0.10.0] - 2026-02-10

### Improved

- Auto-move now also triggers when starting a task `[/]`, not just completing `[x]`

## [0.9.0] - 2026-02-06

### Added

**Auto-Move Completed Tasks**
- Completed tasks in daily notes automatically move from Todo to Log section
- Triggers when you mark a task as done `[x]` in the Todo section
- New setting: `dailyNoteLogHeading` to configure the destination section

## [0.8.1] - 2026-02-04

### Added

- New setting: `logExtractionTargetHeading` for Extract Log destination (decoupled from periodic note setting)

### Fixed

- Extract Log now prepends entries (reverse-chronological order restored)

## [0.8.0] - 2026-02-03

### Changed

- Tasks now append to end of target section instead of prepending

## [0.7.1] - 2026-02-03

### Fixed

- Preserve task order when moving multiple tasks across commands
- Use consistent 4-space indentation for taken project tasks

## [0.7.0] - 2026-01-30

### Added

**Project Commands**
- **Take Project Task** — Pull a task from a project note into today's daily note
- **Drop Task to Project** — Send a task from daily note to a project's Todo section
- New hotkey bindings: `t` for take, `p` for drop (in hotkey modal)

### Improved

- Hotkey modal now includes all task movement commands

## [0.6.0] - 2026-01-29

### Added

**Hotkey Menu**
- New "Which-Key" style modal for quick command access
- Press `Mod+Shift+B` to open the hotkey menu, then a single key to execute:
  - `m` - Migrate task
  - `d` - Push task down
  - `u` - Pull task up
  - `e` - Extract log
- Reduces hotkey conflicts by using key sequences instead of individual shortcuts

## [0.5.1] - 2026-01-28

### Improved

- Internal code architecture following Domain-Driven Design patterns
- Better separation between domain logic and Obsidian integration
- Type-safe task state transitions

## [0.5.0] - 2026-01-27

### Added

**Pull Up**
- New command to move tasks to higher-level periodic notes
- Pull from daily → weekly, weekly → monthly, monthly → yearly
- Smart deduplication: merges with existing tasks instead of creating duplicates
- Reopens scheduled `[<]` tasks when pulling up
- Marks source tasks with `[<]` (scheduled marker)
- Supports multi-select: pull multiple tasks at once

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
