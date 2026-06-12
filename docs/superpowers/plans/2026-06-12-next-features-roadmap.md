# Roadmap: Next Features

Date: 2026-06-12
Status: v0.12.0 released (PR #31 merged). This file is the starting point for the
next development sessions. Background reading:
[2026-06-10 repo review](../specs/2026-06-10-repo-review-and-improvement-plan.md),
[WORKFLOW.md](../../../WORKFLOW.md), [CLAUDE.md](../../../CLAUDE.md).

## What v0.12.0 already delivered (don't re-plan)

- All confirmed bugs from the review: indentation unit model (tabs/spaces),
  nested-merge indentation, regex-safe headings, target-write-before-source-edit
  ordering, settings migration, multi-cursor selections, auto-move pane race,
  locale-week (`ww`) support across the entire week pipeline.
- Only incomplete children travel on migrate/push/pull/take; completed subtrees
  stay in the source.
- Target notes auto-created with the Daily Notes / Periodic Notes template
  applied (`obsidian-daily-notes-interface`, wrapped in
  `src/utils/periodicNoteCreator.ts`).
- Note locations (folder + filename format per granularity) resolve from the
  Daily Notes / Periodic Notes plugins at command time (`getPeriodicConfig()`);
  Bullet Flow no longer has its own pattern settings.
- Multi-task takes group under a `Push [[Project]]` collector; migrate prepends
  the project link for tasks nested under a project bullet; extract-log headings
  use the whole line minus the link.

## 1. Complete project tasks from the daily note (top priority)

The missing piece of the project loop. Today, finishing a project task that was
taken into the daily note requires manual bookkeeping in the project note.

**Command: "Complete project task"** — cursor on (or selection of) tasks in a
daily note that reference a project (own line link or ancestor/collector link,
via `findProjectLinkInAncestors`):

1. In the project note: find the matching `[<]` (scheduled) task under the Todo
   heading, mark it `[x]`.
2. Append a log entry to the project note under the log-extraction heading,
   extract-log style (`### [[<daily note>]] …` sub-heading), recording the
   completion and any children of the daily-note task.
3. In the daily note: mark the task `[x]` and leave it in place (auto-move will
   carry it to `## Log` as usual).

Building blocks all exist: `findProjectLinkInAncestors` (projects.ts),
`findMatchingTask`/`findSectionRange` (tasks.ts), the extract-log insertion
shape (extractLog.ts), the three-phase ordering convention (collect → write
target → mutate source; see docs/key-insights.md).

Open design questions to settle at the start (use the brainstorming skill):
- What if the project copy is not found or already `[x]`? (Suggest: still log,
  notice the mismatch.)
- Hotkey-modal key (suggest `c`).

## 2. Target picker for take/migrate + level-skipping push/pull

- Take/migrate variant that opens a suggest-modal: day/week/month/year ×
  this/next, then transfers to that periodic note (creating it from template if
  missing — machinery exists in `getOrCreateFile`).
- Capital-letter bindings in the hotkey modal (`D`, `U`) for push/pull that skip
  a level (e.g. yearly → weekly, daily → monthly). `HOTKEY_BINDINGS` lives in
  `src/config.ts`; the modal registers per-key handlers, lowercase only so far.

## 3. Suggester dialogs for project commands

- **Take from a periodic note:** invoking "take project task" with the cursor on
  a `[[Project]]` link (instead of inside the project note) opens a multi-select
  list of that project's open tasks; chosen tasks are taken as if selected in
  the project note (collector grouping included).
- **Drop to project without a link:** when `findProjectLinkInAncestors` finds
  nothing, offer a FuzzySuggestModal of active projects (top-level files in the
  projects folder) instead of erroring; include a "create new project" entry
  that makes the note and drops the task into it.

## 4. Smaller items (can ride along with any batch)

- **Custom bullets**: mood, intention, drinks `[Y]`, event `[e]`, reading `[r]`.
  Decide per marker: real task state (extend `TaskState` — the five-location
  checklist is documented in `src/utils/taskMarker.ts` header) vs. visual-only
  (CSS snippet in `snippets/custom-checkboxes.css` / `styles.css`, like `[o]`).
  Most are probably visual-only.
- **Vault-wide completion logging**: completing/starting a task anywhere appends
  it to today's daily log; prepend a source-note wikilink when the task is
  outside the periodic hierarchy. Extends `src/events/autoMoveCompleted.ts`
  (currently gated to daily notes).
- **Finish project prompts**: after archiving, ask which Areas/Resources should
  link the archived project and append it to a list there.
- **handleNewNote** (legacy Templater script in `scripts/`): pin a
  "current folder" option to the top of the folder suggester. Separate JS test
  suite — don't apply plugin test conventions.

## 5. Further out / hygiene

- **Focus mode** (collapse everything but the current bullet subtree) and
  **PARA link decorations** (mini-icons on links into 1 Projekte / 2 Areas / …):
  CM6 editor-extension work; spec separately before building.
- **Metadata-cache freshness guard** (review §3.5, still open): before
  destructive edits, verify cached list-item positions still match the editor
  text; needs a design that avoids false positives on mixed indents.
- **Release hygiene**: every push to `claude/**` publishes a BRAT-consumable dev
  release (`.github/workflows/release-on-push.yml`). Decide whether to keep
  that, mark dev builds prerelease-only, or gate them manually.
- **Phase-3 refactor** (shared transfer engine across the five commands) from
  the review remains optional: the five commands still share a copy-pasted
  three-phase shape. Worth doing if features 1–3 above make the duplication
  painful, not as an end in itself.

## Working agreements (carried over)

- TDD always; markdown-first integration tests (see tests/CLAUDE.md).
- Three-phase command ordering: collect (read-only) → write target → mutate
  source. Never modify the source before the target write succeeds.
- Indentation: never hardcode `'  '`; go through `detectIndentUnit` /
  `convertIndentUnit` / `indentLinesWith` (docs/key-insights.md).
- Week math: respect `usesLocaleWeeks(config)` — the weekly format token decides
  the week system everywhere.
- Notices use human-readable command names; CHANGELOG entries describe what
  users experience.
