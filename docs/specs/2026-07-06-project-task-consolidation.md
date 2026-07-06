# Design: Project-Aware Task Consolidation

Date: 2026-07-06 (revised same day: daily notes never group tasks under
collectors — daily tasks are completed out of order and carry different
priorities, so they stay individually prefixed)
Status: Proposed

## Problem

`takeProjectTask` brings project tasks into the daily note in one of two shapes:
prefixed (`- [ ] [[Project]] Task`) or grouped under a collector
(`- [ ] Push [[Project]]`). But the commands that move tasks *between periodic
notes* — `pushTaskDown`, `pullTaskUp`, `migrateTask` — are project-blind on the
target side, and partially blind on the source side:

- **Context loss.** `pushTaskDown` and `pullTaskUp` copy the task line verbatim.
  A task nested under a collector arrives in the target top-level with no
  project link at all — the project context silently disappears.
  (`migrateTask` already restores the prefix, but does nothing more.)
- **Fragmentation.** The target's Todo section is never scanned for existing
  project groupings. Pushing a second task for a project next to an existing
  prefixed task, or next to a collector, produces parallel structures instead
  of one grouping per project.
- **Alias blindness.** All existing matching is exact-text.
  `[[Project|alias]] Task` never matches `[[Project]] Task`;
  `findCollectorTask` cannot see a collector written as `Push [[Project|P]]`;
  `takeProjectTask`'s dedup key is the literal string `[[Project]] Task`.
- **No dedup under collectors.** `insertUnderCollectorTask` blindly appends, so
  repeated takes/pushes duplicate tasks under the collector.

The desired invariant: **within a Todo section, each project converges toward a
single shape** — and matching is alias-aware everywhere. Which shape depends on
the target note type:

- **Weekly, monthly, and yearly notes** converge toward one *collector* per
  project once two or more tasks exist (a single prefixed task before that).
- **Daily notes** never group tasks under collectors. Daily tasks are unlikely
  to be completed in order and carry different priorities, so grouping them
  hides exactly the distinctions the daily list exists to show. Each project
  task stays an individually prefixed task.

## Terminology

- **Collector** — a list item whose content is `<keyword> <project link>`,
  where `<keyword>` comes from the `projectKeywords` setting and
  `<project link>` is `[[Project]]` or `[[Project|alias]]` resolving to a
  project note. Both plain bullets (`- Push [[Project]]`) and incomplete tasks
  (`- [ ] Push [[Project]]`, `- [/] …`) count. Newly created collectors are
  always incomplete tasks (`- [ ]`), using the first configured keyword.
- **Prefixed task** — a task whose content starts with a project link:
  `- [ ] [[Project]] Task` or `- [ ] [[Project|alias]] Task`.
- **Project task (source side)** — a task that either is a prefixed task, or
  has a project link in its ancestor chain (`findProjectLinkInAncestors`) —
  which covers collectors and pure project-link bullets alike.
- **Sub-section slice** — the innermost heading-delimited slice inside the
  target Todo section that contains a given line. Todo sections may be
  structured with sub-headings; consolidation never moves tasks across a
  heading boundary.
- **Alias-aware matching** — two project links match when their link targets
  (the part before `|`) resolve to the same project note, regardless of alias
  on either side.

## Shared behavior: project-aware target insertion

A new shared routine used by all four commands. Input: the target content, the
target heading, the resolved project (name plus the source link's alias, if
any), the tasks to insert (project-stripped text, full content, children), and
a **collector-grouping flag** — set by the caller from the target note type:
enabled for weekly/monthly/yearly targets, disabled for daily targets. All
scanning is scoped to the target heading's section.

For each task, in order (cases 2 and 3 are skipped when grouping is disabled):

1. **Dedup first.** Scan the section for a live (open/started/scheduled) task
   whose *project-stripped* text equals the pushed task's stripped text and
   whose project matches — either via its own prefix (alias-aware) or via the
   collector it sits under. On match: reopen `[<]` as `[ ]`, merge children
   under it (existing dedup semantics). The task keeps its current shape and
   position; no structural change follows. Dedup applies regardless of the
   grouping flag — merging into an existing copy under a manually created
   collector in a daily note is deduplication, not grouping.
2. **Collector exists.** If the section contains a collector for the project
   (first one wins when several exist), append the task under it as the last
   child, with its project prefix stripped. Stray top-level prefixed tasks for
   the same project in the collector's sub-section slice are folded under the
   collector too (prefixes stripped, original order preserved) — same
   convergence rule as case 3.
3. **Prefixed sibling(s) exist.** If the section contains one or more top-level
   prefixed tasks for the project, and they all live in the same sub-section
   slice: create a collector at the position of the first match and indent all
   matches plus the incoming task under it (in that order), stripping all
   prefixes. Collector line: `- [ ] <first keyword> [[Project]]`, or
   `- [ ] <first keyword> [[Project|alias]]` when an alias applies.
   **Alias preference:** the first existing target task's alias wins; if no
   target task has one, the incoming task's alias is used; otherwise no alias.
   If the matches span multiple sub-section slices, skip consolidation and fall
   through to case 4.
4. **No match.** Append the task at the end of the section (current placement),
   as a prefixed task. The prefix is the task's own link taken as-is when it
   has one; otherwise the source collector's link — including its alias.
   With grouping disabled this is the only insertion shape: even when the
   daily note contains a collector for the project (e.g. created manually),
   the new task is appended prefixed at the end of the section, not under it.

**Multi-select in one invocation** (grouping enabled only): when a single
command run inserts two or more *new* tasks for the same project and cases 1–3
all miss, a collector is created for them directly (generalizing
`takeProjectTask`'s current multi-take behavior) instead of appending two
prefixed siblings that the next run would consolidate anyway. A single new
task follows case 4. With grouping disabled, every new task is an individual
prefixed append.

Non-project tasks are unaffected: they keep the current whole-file dedup and
flat append-under-heading path.

## Command changes

- **`pushTaskDown`** — detects project tasks (own-line prefix or ancestor
  link); routes them through the shared insertion. Grouping is enabled for
  yearly→monthly and monthly→weekly pushes, disabled for weekly→daily pushes:
  a task pushed into the daily note always arrives as an individually prefixed
  task (prefix inherited from the source collector when needed). Non-project
  tasks unchanged.
- **`pullTaskUp`** — same treatment, grouping always enabled (targets are
  weekly/monthly/yearly by construction). This is new ground: today the
  command has no project awareness at all, so tasks pulled out from under a
  collector currently lose their project entirely.
- **`migrateTask`** — keeps its existing prefix restoration, and its target
  insertion becomes project-aware for project tasks; grouping always enabled
  (migration targets are weekly or above by the boundary rules — a daily note
  is never a migration target). Note this introduces dedup for project tasks
  in a command that currently never dedups; a migrated task whose text already
  lives in the target merges instead of duplicating. Non-project tasks keep
  the current no-dedup append.
- **`takeProjectTask`** — always targets today's daily note, so grouping is
  always **disabled**. This *reverses* two pieces of shipped behavior: taken
  tasks are no longer inserted under an existing collector, and multi-take no
  longer creates one. Every taken task arrives as `- [ ] [[Project]] Task`
  under the target heading. What it gains from the shared routine: dedup
  becomes alias-aware, prefix-insensitive, and also matches copies sitting
  under a collector (case 1), so repeated takes merge instead of duplicating.
  The bespoke collector block (`findCollectorTask` lookup, collector creation,
  `insertUnderCollectorTask`) is removed from the command.

`dropTaskToProject` and `completeProjectTask` are out of scope: their
prefix-stripping is already alias-aware, and their targets (project note Todo /
Log) have no collector concept.

## Decisions

- **Daily notes never group.** Collector grouping is a planning shape for
  weekly/monthly/yearly notes. In the daily note, tasks are worked in whatever
  order the day demands and carry individual priorities, so grouping them
  under a collector obscures rather than organizes — every project task in a
  daily note is an individually prefixed task. Collectors in daily notes
  remain meaningful as *source-side* context (ancestor detection for
  migrate/drop/complete is unchanged); the commands just never create them or
  insert under them there.
- **Dedup beats restructuring.** When the incoming task already exists in the
  target, merging is strictly better than consolidating two copies under a
  collector — after the merge there is nothing left to consolidate.
- **Collectors absorb strays** (grouping-enabled targets only). When a
  collector exists, matching prefixed tasks in its sub-section slice fold
  under it rather than being left as parallel structure. This keeps the
  one-grouping-per-project invariant self-healing over time.
- **Consolidation respects heading boundaries.** Some Todo sections are
  structured with sub-headings; tasks are never moved across a heading
  boundary. When matches span slices, the command degrades to a plain prefixed
  append rather than guessing which slice is canonical.
- **Only top-level tasks are consolidation candidates.** A prefixed task nested
  under some other item stays where it is; restructuring someone else's
  hierarchy is out of bounds. (Such tasks still count for dedup.)
- **Match by link target, not display text.** `[[Project|P]]` and
  `[[Project]]` are the same project. Prefix links must resolve to a note in
  the projects folder (`isProjectLink`) to trigger project handling — an
  unresolvable or non-project leading link is plain text.
- **New collectors are tasks.** `- [ ] <keyword> [[Project]]` — matching what
  `takeProjectTask` creates today. Plain bullets are recognized when scanning
  but never created.
- **Indentation** — children placed under a collector are re-rendered in the
  target's indent unit via the standard helpers, as `insertUnderCollectorTask`
  already does. Consolidated tasks keep their own children, re-indented one
  level deeper.
- **Notices unchanged** in shape; merged/consolidated tasks count as "merged",
  newly appended ones as "new".

## Components

- `src/utils/projects.ts`
  - `parseProjectPrefix(taskText)` — alias-aware leading-link parse returning
    link target, alias, and remaining text (generalizes `stripProjectPrefix`,
    which becomes a thin wrapper or is absorbed).
  - `findCollector(...)` — replaces `findCollectorTask`: alias-aware,
    bullet-or-task, section-scoped, returns line and the link's alias.
  - The shared insertion routine (working name
    `insertProjectTasksInSection`) implementing cases 1–4 plus the
    multi-select rule, taking the collector-grouping flag, returning
    merged/new counts like `insertMultipleTasksWithDeduplication`.
- `src/utils/tasks.ts` — expose the section/sub-section slice math
  (`findSectionRange` already exists; add the innermost-slice lookup) and a
  prefix-insensitive variant of the `findTaskMatch` scan for case 1.
- `src/types.ts` — extend `TaskInsertItem` (or add a project-task variant) to
  carry the resolved project and source alias.
- `src/commands/pushTaskDown.ts`, `pullTaskUp.ts`, `migrateTask.ts`,
  `takeProjectTask.ts` — wire project tasks through the shared routine;
  `takeProjectTask` drops its inline collector logic.

No new settings: reuses `projectKeywords`, `projectsFolder`, and
`periodicNoteTaskTargetHeading`. Phase order is untouched: collect (read-only)
→ write target via `vault.process` → mutate source.

## Examples

Pushing `- [ ] Draft update` from under `- [ ] Push [[Engineering Update|EU]]`
in the **monthly** note into the **weekly** note (grouping enabled):

Weekly note has a single prefixed task (case 3, alias from target absent,
source alias used):

```
## Todo                              ## Todo
- [ ] [[Engineering Update]] Ask     - [ ] Push [[Engineering Update|EU]]
      Samir for numbers          →   	- [ ] Ask Samir for numbers
                                     	- [ ] Draft update
```

Weekly note has a collector (case 2):

```
## Todo                              ## Todo
- [ ] Push [[Engineering Update]]    - [ ] Push [[Engineering Update]]
	- [ ] Ask Samir for numbers  →   	- [ ] Ask Samir for numbers
                                     	- [ ] Draft update
```

No match (case 4 — prefix inherited from the source collector, alias kept):

```
## Todo                              ## Todo
- [ ] Unrelated task             →   - [ ] Unrelated task
                                     - [ ] [[Engineering Update|EU]] Draft update
```

Pushing the same task from the **weekly** note into the **daily** note
(grouping disabled) — always a prefixed append, even next to an existing
prefixed task or a manually created collector:

```
## Todo                              ## Todo
- [ ] [[Engineering Update]] Ask     - [ ] [[Engineering Update]] Ask
      Samir for numbers          →         Samir for numbers
                                     - [ ] [[Engineering Update|EU]] Draft update
```

## Error handling

- Command-level validation (periodic-note checks, level checks, selection
  checks) is unchanged.
- A project link that no longer resolves downgrades the task to a plain task
  (current behavior of the affected commands is preserved: no notice, normal
  insertion).
- Target write failure leaves the source untouched (existing transactional
  guarantee).

## Testing

Unit (`tests/unit/`):
- `parseProjectPrefix`: alias/no-alias, multiple `|`, non-leading links,
  unresolved targets.
- `findCollector`: keyword matrix × bullet/task × alias/no-alias, scoping to
  the section, first-of-several.
- Insertion routine: each case 1–4; alias preference matrix (target-alias
  wins, source-alias fallback); stray folding under an existing collector;
  sub-section boundary → fallback to prefixed append; multi-select collector
  creation; nested prefixed tasks excluded from consolidation; dedup under a
  collector reopens `[<]` and merges children; indent-unit conversion;
  grouping disabled → prefixed append even when a collector or prefixed
  sibling exists, while dedup (including under a collector) still merges.

Integration (`tests/integration/`, markdown-first), per command:
- push/pull/migrate: task under a collector keeps project context in the
  target; each of cases 1–4 end-to-end; non-project tasks unchanged
  (regression on the existing dedup suites).
- `pushTaskDown`: monthly→weekly groups (cases 2–3); weekly→daily never
  groups — prefixed append next to an existing collector, prefix inherited
  from the source collector.
- `takeProjectTask`: taken tasks always arrive prefixed — no insertion under
  an existing collector, no collector creation on multi-take (both are
  deliberate reversals of current behavior; the old tests covering them are
  replaced, not deleted-to-pass); repeated take of the same task merges
  instead of duplicating, including when the daily copy sits under a
  manually created collector; alias-aware dedup.
- `migrateTask`: project task merges with an existing copy; non-project task
  still duplicates as today.

## Follow-ups (out of scope)

- Section-scoping the *general* (non-project) dedup to the Todo section — it
  currently scans the whole file.
- Collector completion hygiene: what happens to an empty collector after all
  its children complete or move away is unspecified today and unchanged here.
