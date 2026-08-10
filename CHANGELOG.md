# Changelog

All notable changes to Bullet Flow are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Tasks moved into a note now stay out of its sub-sections.** Migrate, push,
  pull, take and drop append under the target heading itself, above any `###`
  sections below it. Organise a weekly `## Todo` into `### Monday`,
  `### Tuesday` or priority buckets and arriving tasks wait in the Todo body
  for you to place them, instead of dropping into whichever section happens to
  be last.
- **Moving a task never groups it under a collector any more.** Migrate, push,
  pull and take always leave a project task on its own line, whatever kind of
  note it lands in — no collector is created for you, nothing already in the
  note is rearranged, and a task no longer disappears into an existing group.
  Grouping is now entirely yours, through *Toggle collector task grouping*
  (`g`). A task that's already in the note still merges instead of arriving
  twice, including when its copy sits under a collector.
- **Toggling a collector now gathers before it spreads.** With the cursor on a
  `Push [[Project]]` line, the first press pulls the project's loose tasks in
  the section into the group — completed ones included — and the next press
  spreads the whole group back out. So a group and a freshly arrived task are
  one keypress from being tidy. Toggling an individual task still groups only
  what you selected.

## [0.18.0] - 2026-08-07

### Changed

- **Take project task** now asks where the task is going: day, week, month or
  year. The picker shows the note behind each option, so you can see the target
  before choosing, and dismissing it leaves both notes untouched. Tasks taken to
  a weekly, monthly or yearly note gather under a `Push [[Project]]` collector,
  as tasks arriving there from anywhere else already do; a task taken to today
  still lands on its own line.

## [0.17.0] - 2026-08-07

### Added

- **Toggle collector task grouping** — switch a project's tasks between the two
  shapes Bullet Flow already writes: gathered under one `- [ ] Push [[Project]]`
  bullet, or listed individually with the project link on each. Put the cursor
  anywhere in a collector to spread its tasks back out, or on a project task to
  gather it up — select several lines to gather several. Tasks you did not
  select stay where you left them. Aliases, sub-tasks and notes travel along,
  and completed tasks stay with their group. Available from the command menu
  as `g`.

### Fixed

- A task added to a collector no longer jumps past the blank line below the
  group — it lands directly under the collector's last task, where the list
  stays intact.

## [0.16.2] - 2026-08-06

### Maintenance

- The Obsidian API is now confined to `src/adapters/`, so the task, project and
  date logic is plain code with no editor dependency — easier to reason about
  and to test. Two checks keep it that way rather than relying on convention.
- Added mutation testing for the core logic, which reports where the tests run
  code without actually checking what it does. Coverage cannot see that.
- Added a whole-codebase design review, run before a release, that looks for
  duplicated ideas and misplaced logic — the kind of drift no automated check
  detects.
- Added codebase analysis (dead code, duplication, complexity) that reports only
  what a change newly introduces, leaving the existing backlog to be worked
  down deliberately. It runs in CI and alongside AI coding sessions.
- Lint and the test suite now run automatically before an AI coding session can
  finish a turn, and lint errors in a file are reported back as soon as it is
  written. Failures come with the suggested fix attached, so problems get caught
  while the work is fresh rather than at review time. Development-only; the
  plugin itself is unchanged.
- Added linting to the development setup, configured with the size and
  complexity limits that catch the mistakes AI-assisted changes tend to make.
  Findings carry a suggested fix rather than only naming the rule, and the
  limits that existing code already exceeds are reported as advisory warnings
  so they can be tightened as the code improves instead of blocking work.
- The auto-move trigger detection — the logic deciding whether a keystroke
  actually completed or started a task — is now covered by tests. It was the
  most complex untested code in the plugin, and it guards every automatic move
  and project completion.
- Raised the test coverage floor to sit just below actual coverage, so a drop
  fails the test run instead of going unnoticed.
- Removed unused imports and a dead local, and dropped an unnecessary export.
  No behavior change.

## [0.16.1] - 2026-08-06

### Fixed

- Completing a project task no longer leaves the `[[Project]]` link in the entry
  written to the project note. A link with a section anchor
  (`[[Project#Todo]]`), a folder path, different capitalisation, or one that
  resolves through a note alias is now recognised as the task's project prefix,
  the same way the task's text has always been matched. Affects **Complete
  project task**, the automatic completion on ticking, and **Drop task to
  project**.
- Re-running **Complete project task** on a task whose completion is already in
  the project's log no longer appends a duplicate entry — the same check that
  already protected automatic completion now covers every way of triggering it,
  including a reopened task completed again. Nothing is filed in that case, so
  the task's notes stay in the daily note.
- **Complete project task** no longer warns "has no matching task in
  [[Project]]" when completing work the project note never listed. Logging a
  completion doesn't depend on the project listing the task, so that is the
  ordinary case for work invented in the daily note — the command now says the
  same as the automatic completion does. A copy left `[x]` in the project's
  Todo is still reported by both.

## [0.16.0] - 2026-08-06

### Fixed

- Releases carry `main.js`, `manifest.json`, and `styles.css` again, so BRAT
  can install and update the plugin. Uploads had been silently rejected since
  the repository started enforcing immutable releases.

### Added

- Ticking a `[[Project]]`-prefixed task in a daily note now completes it in its
  project note automatically: the project's Todo copy is removed and a log
  entry with the task and its notes is written, the same as running **Complete
  project task**. Ticked under `## Todo`, the task line then moves to `## Log`
  as usual; ticked in `## Log` — work written down as it happened — the line
  stays put and only its notes travel to the project. Tasks the project never
  listed are logged too, and completing the same task twice doesn't log it
  twice. Started `[/]` tasks, sub-tasks, and tasks that merely mention a project
  mid-line are unaffected.

## [0.15.3] - 2026-07-13

### Fixed

- Multi-selecting a collector's task children (e.g. two sub-tasks under
  `Push [[Project]]`) and running push/pull/migrate no longer reports "No
  incomplete tasks in selection" — each selected child now transfers as its
  own project task, matching what already happened when selecting one at
  a time.

## [0.15.1] - 2026-07-10

### Maintenance

- Removed unused ESLint devDependencies.
- Consolidated duplicated task-transfer logic shared by migrate/push/pull/take
  (collector decomposition, child-content preparation, and completion notices)
  into shared utilities. No behavior change.

## [0.15.0] - 2026-07-10

### Changed

- Project tasks now converge to one grouping per project when moved between
  notes: pushing, pulling, or migrating a project task merges with existing
  copies (aliases understood), joins an existing `Push [[Project]]` collector,
  or consolidates loose `[[Project]]`-prefixed tasks under one — in weekly,
  monthly, and yearly notes. Daily notes never group: tasks taken or pushed
  into today's note always arrive individually, prefixed with their project
  link. Taking multiple tasks no longer creates a collector in the daily note.
- Pushing, pulling, or migrating a `Push [[Project]]` collector itself (rather
  than a task under it) now moves each of its tasks individually instead of
  the whole group as one block — so a task already sitting in the target
  reopens and merges instead of duplicating. Any plain note directly under
  the collector stays behind.

## [0.14.0] - 2026-07-03

### Changed

- Complete project task now works like extract log: the task's notes move into
  the project's log entry instead of staying duplicated in the daily note
- The finished task is removed from the project's `## Todo` section — the log
  entry is the record; any sub-items still sitting under the project copy move
  into the log entry too, so nothing is lost
- Completing several tasks from the same note one by one no longer repeats the
  log sub-heading; entries accumulate under a single section per source note

## [0.13.0] - 2026-07-02

### Added

- Complete project task: finishing a task taken into the daily note now closes
  the loop in one step — the project's `[<]` copy is marked done and a log
  entry with the task and its notes is added to the project note (`c` in the
  command menu)

### Fixed

- Tasks prefixed with an aliased project link (`[[Project|Alias]]`) now match
  their project copy when completed or dropped back, instead of being treated
  as missing

## [0.12.1] - 2026-06-12

### Improved

- Removed unused code left over from earlier refactors and refreshed the
  contributor documentation (codebase map, week-system and testing notes)

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
