# Repository Review & Improvement Plan

Date: 2026-06-10
Scope: full review of Bullet Flow (plugin source, tests, docs, tooling), with a phased
improvement plan. Findings marked **[confirmed]** were reproduced against the actual
plugin code; others are based on code reading.

> **Implementation status (v0.12.0, released 2026-06-12):** Phases 0–2 fully
> implemented (§3.1–§3.4, §3.6–§3.8, §3.11, notice prefixes, doc drift), plus from
> Phases 3–4: target-note auto-creation with Periodic Notes templates (§4.1),
> collector grouping on multi-take, project-link prepending on migrate, extract-log
> whole-line headings, and note locations resolved from Daily Notes / Periodic
> Notes (pattern settings removed). Locale-week (`ww`) support added across the
> week pipeline. Deliberately **not** done after re-evaluation: §3.9 (collector
> duplicates cannot arise given the `[<]` state machine) and §3.10 (open tasks
> legitimately live in the daily Log, so file-wide dedup matching is desired).
> Still open: §3.5 (cache-freshness guard), the shared transfer engine, Phase 5
> release hygiene. Next steps live in
> [the roadmap](../plans/2026-06-12-next-features-roadmap.md).

---

## 1. What this repository is

Bullet Flow is an Obsidian plugin implementing a BuJo-inspired daily workflow: rapid
capture in daily notes, then explicit text transformations to move tasks and knowledge
to where they belong. Seven commands (extract log, migrate, push down, pull up, take
from project, drop to project, finish project), a CodeMirror 6 auto-move extension
(completed/started tasks move from `## Todo` to `## Log` in daily notes), a leader-key
command modal, and a settings tab. A legacy Templater script (`scripts/handleNewNote.js`)
lives alongside. Releases ship via GitHub Actions + BRAT.

## 2. Architecture assessment

**Strengths — worth preserving:**

- Clean layering: commands → pure domain utils → thin Obsidian boundary. The
  `LinkResolver` adapter and `TaskMarker` state machine are genuinely good designs.
- The "every operation is a direct text transformation" principle is consistently
  applied; no hidden state anywhere.
- Strong test culture: unit, integration (markdown-first, input → output), and e2e
  suites; the full suite passes cleanly. ISO-week edge cases are exhaustively covered.
- The March 2026 audit was executed and visibly improved the codebase (TaskMarker
  extraction, auto-move re-scan design, batch insertion).

**Structural weaknesses:**

- **Two competing hierarchy models.** Commands use `metadataCache.listItems`
  (`findChildrenBlockFromListItems`), while `autoMove.ts`, `insertChildrenUnderTask`,
  and `insertUnderCollectorTask` re-implement child-block detection by counting indent
  characters. These disagree on mixed tab/space files. One abstraction should win.
- **Indentation is modeled as a character count**, not as a unit. `countIndent` counts
  chars (a tab = 1), while all insertion paths hardcode 2 *spaces*. This is the root
  cause of the tab/space mixing bugs (§3.1, §3.2).
- **Five near-identical two-phase command bodies.** migrate/push/pull/take/drop all
  repeat the same ~70-line pipeline (resolve target → collect tasks bottom-up → mutate
  source → insert into target → Notice). Every wishlist feature (target picker,
  collector grouping, open-children-only) currently has to be implemented five times.
  Extracting a shared task-transfer engine with strategy parameters (target resolution,
  source marker, heading, link decoration) is the single highest-leverage refactor.
- **Dual API in `periodicNotes.ts`**: `PeriodicNoteService` exists, but the free
  functions still accept `settingsOrFolder: BulletFlowSettings | string`. The audit
  plan called for removing the string overload; it survives.

## 3. Confirmed bugs

### 3.1 Tab/space mixing when moving tasks **[confirmed]**

`buildTaskContent(parent, children, 2)` (`src/utils/tasks.ts:311`) and the merge path in
`insertMultipleTasksWithDeduplication` (`'  ' + line`, `src/utils/tasks.ts:376`) prepend
spaces to children whose own relative indentation is still in tabs.

Repro (actual output): pushing down `\t- [ ] Parent` with child `\t\t- child note`
produces:

```
- [ ] Parent task
  \t- child note        ← 2 spaces + 1 tab
```

This matches the reported "glitchy display" — Obsidian's indent guides and fold logic
misbehave on mixed indentation. Same defect in `insertUnderCollectorTask`
(`src/utils/projects.ts:207`) and `indentLines` (`src/utils/indent.ts:24`).

### 3.2 Merging children under a nested target task breaks hierarchy **[confirmed]**

`insertChildrenUnderTask` indents merged children by a fixed 2 spaces *from column 0*,
ignoring the matched task's own indentation. Pulling up `Review PR` with children into
a weekly note where `- [<] Review PR` sits nested under an epic produces:

```
- [ ] Epic
\t- [ ] Review PR
  - check tests          ← shallower than its "parent"
```

The merged children land outside the task they belong to. This is the likely cause of
the reported "pull up… indentation gets messed up".

### 3.3 `findSectionRange` does not escape regex metacharacters **[confirmed]**

`src/utils/tasks.ts:131` builds `new RegExp("^## " + text + "\\s*$")` from the raw
heading setting. A heading like `## Todo (work)` or `## C++` never matches → commands
silently create a duplicate heading on every insertion, and auto-move goes dead.

### 3.4 Destructive operations run before the target write (data-loss window)

All five transfer commands mutate the source **first** (mark `[>]`/`[<]`, delete
children — `dropTaskToProject` deletes the entire task line) and only then write the
target via `vault.process`. If the target write throws (sync conflict, plugin clash,
I/O error), the collected content exists only in memory and is lost; the source already
shows the task as moved. `extractLog` has the same ordering (it at least copies to
clipboard first). The safe order is: write target → verify → mutate source.

### 3.5 Stale `metadataCache` can corrupt edits

Commands trust `metadataCache.listItems` line positions for destructive
`editor.replaceRange` calls. The cache updates asynchronously after edits; invoking a
command immediately after typing can delete the wrong lines. The e2e suite already had
to grow `waitForCacheReady` workarounds — real users don't get that guard. Before any
destructive edit, the command should verify the cached positions still match the editor
text (cheap: compare the task line text), and abort with a notice if not.

### 3.6 Settings default drift explains "pull up adds to Log, not Todo"

v0.11.1 changed `periodicNoteTaskTargetHeading` default from `## Log` to `## Todo` but
explicitly left saved settings untouched. Any vault configured before 0.11.1 still has
`## Log` in `data.json`, so pull-up/migrate insert into Log. There is no settings
migration/versioning mechanism. Either add one, or surface the effective values more
visibly. (Immediate fix for the affected vault: update the setting in the settings tab.)

### 3.7 Auto-move validates the wrong view

`performAutoMove` (`src/events/autoMoveCompleted.ts:76`) gates on the **active** view's
file being a daily note, but computes and dispatches changes against the **captured**
`EditorView` from detection time. If focus changes between the edit and the
`setTimeout(0)` callback, the gate is evaluated against a different document than the
one being mutated. Resolve the file from the captured view instead.

### 3.8 Migrating a task moves its completed children out of today

`findChildrenBlockFromListItems` collects *all* descendants; migrate/push/pull copy the
whole block to the target and delete it from the source. Completed `[x]` children are
thus removed from the day they were completed and re-appear in tomorrow's note — both a
paper-trail violation (the day's record is falsified) and the source of the wishlist
item "when migrating tasks with children, only migrate open tasks". Completed/migrated
children should stay behind; only incomplete descendants should travel.

### 3.9 Collector insertion path skips deduplication

In `takeProjectTask`, when a collector task exists, tasks are appended without checking
for existing matches (`src/commands/takeProjectTask.ts:150-155`). Taking the same task
twice duplicates it under the collector. The heading path deduplicates; the collector
path should too.

### 3.10 Deduplication matches anywhere in the file

`findMatchingTask` scans the whole target document. A same-text task in `## Log` (or
any unrelated section) that happens to be `[ ]`/`[<]` will absorb merged children.
Matching should be scoped to the relevant section (the target heading's range).

### 3.11 Only the first selection is honored

`findSelectedTaskLines` uses `editor.listSelections()[0]`. Multi-cursor / multi-range
selections silently drop all but the first range.

## 4. UX inconsistencies and friction

1. **Target note must already exist.** End-of-day migration targets tomorrow's daily
   note, which typically doesn't exist yet → constant "Target note does not exist"
   friction. Commands should offer to create the note (folder + file from pattern),
   ideally via the Periodic Notes plugin's template when available.
2. **Notices leak internal identifiers** ("pushTaskDown: Task pushed to lower note.").
   Use the human command names; keep messages consistent in tone.
3. **`projectKeywords` format** (`"Push", "Finish"`) is a fragile, custom quoting
   syntax for a setting that could be plain comma-separated text.
4. **Heading created at the very top of the file.** When the target heading is missing,
   `insertUnderTargetHeading` inserts at line 0 (or right after frontmatter), landing
   *above* any H1 title. `extractLog`'s create-at-end behavior is the better pattern.
5. **Hotkey modal bypasses the command registry.** `HotkeyModal` calls command
   functions directly instead of `executeCommandById`, so palette/hotkey customization
   and the modal can drift. The bindings table in `config.ts` and the registry in
   `HotkeyModal.ts` are parallel structures that must be kept in sync by hand.
6. **Settings tab uses `createEl('h2')`** instead of Obsidian's `setHeading()`
   convention (community-plugin review would flag this; cosmetic for a personal plugin).
7. **`dropTaskToProject` partial-failure reporting**: per-task "No project link found
   for task on line N" notices reference pre-edit line numbers after earlier tasks in
   the same run have already shifted lines.

## 5. Documentation drift

- `migrateTask.ts` header and README both say tasks land under `## Log`; since 0.11.1
  the default is `## Todo`.
- README's Extract Log example ("back-link with timestamp", `- 2026-01-25 Sat - …`)
  describes behavior the command no longer has (it creates a `### [[daily note]] …`
  sub-heading and rewrites the source link with a section anchor).
- README links to `TESTING.md`, which doesn't exist (testing docs live in
  `tests/CLAUDE.md`).
- README's project structure section lists only two commands.

## 6. Tooling / release observations

- **Every push to `claude/**` publishes a BRAT-visible dev release** with `contents:
  write`. BRAT auto-updates installed vaults to the newest release — so unreviewed
  work-in-progress can land in the production vault. Consider gating dev releases
  behind a manual trigger or marking them `prerelease: true` and pointing BRAT at
  stable releases only.
- Pre-commit/pre-push githooks and the CI pipeline are in good shape; e2e on
  wdio-obsidian-service is a notable asset.

## 7. Improvement plan

Phased so each phase is independently shippable. Phases 1–2 fix correctness and safety;
Phase 3 is the refactor that makes the wishlist cheap; Phases 4–5 build the new
features on that foundation.

### Phase 0 — Quick wins (no design needed)

- Escape regex metacharacters in `findSectionRange` (§3.3).
- Settings migration: introduce a `settingsVersion` field; on load, migrate legacy
  values (or at minimum document the 0.11.1 heading change prominently).
- Fix stale docs: migrateTask header comment, README (Extract Log example, command
  list, TESTING.md link, default headings).
- Human-readable notice prefixes (§4.2).
- Scope `findMatchingTask` to the target heading's section (§3.10).
- Dedup on the collector path of takeProjectTask (§3.9).

### Phase 1 — Indentation correctness

- Introduce an indentation model: detect the unit per insertion context (or read
  Obsidian's editor settings — `useTab` / `tabSize`) and normalize transferred blocks
  to one unit. Per the stated preference: normalize to tabs.
- Make merged-children indentation relative to the matched task's indent (§3.2).
- Replace raw char-count comparisons in `autoMove.ts`, `insertChildrenUnderTask`,
  `insertUnderCollectorTask` with the shared model.
- Add tab-indented and mixed-indent fixtures to every transfer command's integration
  tests (currently all fixtures are space-indented).

### Phase 2 — Transactional safety

- Reverse the phase order in all transfer commands: write target first, then mutate
  source; on target failure, leave source untouched (§3.4).
- Cache-freshness guard: before destructive edits, verify the cached list-item
  positions still match editor text; abort with a clear notice otherwise (§3.5).
- Fix the auto-move active-view race (§3.7).
- Honor all selection ranges (§3.11).

### Phase 3 — Unify the task-transfer engine

Extract one `transferTasks` pipeline parameterized by: target resolution, source-state
transition (`[>]` vs `[<]` vs delete), target heading, link decoration (prepend project
link or not), child filter, and grouping strategy. All five commands become thin
configurations. This unlocks, with single implementations:

- **Only migrate open children** (§3.8; wishlist).
- **Prepend the project wikilink when migrating a task nested under a project bullet**
  (wishlist) — reuse `findProjectLinkInAncestors`, already written for drop-to-project.
- **Collector grouping**: when taking multiple project tasks, create a
  `Push [[Project]]` bullet and nest tasks under it without repeating the link
  (wishlist; the collector concept already exists in `projects.ts`).
- **Offer to create missing target notes** (§4.1).

### Phase 4 — Wishlist features (each on the Phase 3 engine)

1. **Complete project tasks from the daily note**: select task(s) referencing a
   project, run one command → mark `[x]` in the project's Todo, append a log entry to
   the project (extract-log style), keep the completed line in today's log.
2. **Target picker for take/migrate**: suggest-modal asking day/week/month/year ×
   this/next; capital-letter leader keys for level-skipping push/pull.
3. **Take from project via link**: invoking "take" with cursor on a `[[Project]]` link
   in a periodic note opens a suggester of the project's open tasks (multi-select).
4. **Drop to project via suggester**: when no project link is found, offer a picker of
   active projects, including a "create new project" entry.
5. **Completion logging vault-wide**: extend the auto-move listener so completing a
   task anywhere appends to today's log, prefixed with a source-note wikilink when the
   task is outside the periodic hierarchy. Gate on the daily note existing.
6. **Finish-project prompts**: ask for Areas/Resources to link the archived project
   from (append to a list there).
7. **Custom bullet states** (mood, intention, drinks `[Y]`, event `[e]`, reading
   `[r]`): the TaskMarker five-location extension pattern is built for this; pair each
   with a CSS snippet entry. Decide explicitly which are tasks (participate in the
   state machine) vs purely visual markers (CSS-only — likely most of them).
8. **handleNewNote**: pin "current folder" to the top of the suggester. (Note: this
   script deletes the new note before the user picks a folder; cancellation deletes the
   note. Verify that is intended.)
9. **Focus mode / PARA link decorations**: editor-extension work, independent of the
   transfer engine; spec separately.

### Phase 5 — Release hygiene

- Stop publishing BRAT-consumable releases from every `claude/**` push, or mark them
  prerelease and configure BRAT for stable-only (§6).
- Align `settings.ts` with Obsidian UI conventions (`setHeading()`).

## 8. Wishlist ↔ plan mapping

| Wishlist item | Where addressed |
|---|---|
| Record project tasks done from daily note | Phase 4.1 |
| Tabs/spaces normalization | Phase 1 |
| Prepend project wikilink on migrate under project bullet | Phase 3 |
| Complete in non-daily periodic note → push to today's log | Phase 4.1 / 4.5 |
| Take project tasks: ask where (level + this/next) | Phase 4.2 |
| Group multiple taken tasks under "Push [[Project]]" | Phase 3 |
| Only migrate open children | Phase 3 (§3.8) |
| Pull up goes to Log instead of Todo | Phase 0 settings migration (§3.6) |
| Pull up indentation messed up | Phase 1 (§3.2) |
| handleNewNote: pin current folder | Phase 4.8 |
| Take-from-project task suggester | Phase 4.3 |
| Drop-to-project project suggester (+ new project) | Phase 4.4 |
| Finish project: prompt for Areas/Resources | Phase 4.6 |
| Level-skipping push/pull (capital keys) | Phase 4.2 |
| Completion logging vault-wide | Phase 4.5 |
| Custom bullets (mood/intention/drinks/event/reading) | Phase 4.7 |
| Focus mode, PARA link decorations | Phase 4.9 |
| Extract: take whole line without link | Extract-log enhancement; spec alongside Phase 4.1 |
