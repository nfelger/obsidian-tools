# Design: Auto-Complete Project Tasks

Date: 2026-08-05
Status: Implemented

## Problem

`completeProjectTask` closes the loop opened by `takeProjectTask`, but only
when the user remembers to run it. The natural gesture is ticking the checkbox
— which the auto-move extension already watches, files under `## Log`, and
otherwise treats like any other task. The project note is left stale until the
command is run by hand, and once the task reads `[x]` the command refuses it
(it only accepts incomplete tasks), so a forgotten completion is a manual
clean-up.

## Behavior

When the auto-move extension picks up a ticked task in a daily note, it now
asks whether that task belongs to a project. If it does, the project-note side
of `completeProjectTask` runs before the task is filed:

1. **In the project note** — the Todo-section copy is removed and a log entry
   (task line `[x]`, project prefix stripped, plus the task's children) is
   appended under `### [[<daily note>]]`, exactly as the command writes it.
2. **In the daily note** — only the task *line* moves to `## Log`; its children
   went to the project log, matching the command's move-not-copy rule.

A notice reports the completion (and any mismatch), so the user sees that the
children moved rather than vanished.

## Both sections

Work reaches the daily note two ways, so both are watched:

- **Ticked in Todo** — the task is filed to the project and its line moves
  under `## Log`, as auto-move has always done.
- **Ticked in Log** — work written straight into the day's log as it happened.
  Nothing moves (the line is already where it belongs), but its notes travel to
  the project log all the same, so the project note holds the detail.

The Log section needs a different way to find the trigger. In Todo a completed
task is transient — auto-move files it immediately — so "the first completed
task in the section" is reliably the one just ticked. In Log completed tasks
accumulate, and nothing in the document distinguishes today's tick from last
week's entry. So the update listener now carries the ticked line's **text**
(never its number, which intervening edits invalidate) and
`findCompletedTaskLineByText` re-locates it. Two identical lines in the section
mean the tick is unattributable: the run bails rather than strip the wrong
entry's notes.

Both passes share `completeTriggerInProject` — the qualifying rules, the
project write, and the children hand-off are one code path parameterised by the
section heading. Only the source-side change differs: a move for Todo
(`computeAutoMove`), a plain deletion of the filed children for Log
(`computeLineRangeRemoval`).

## Qualifying tasks

The ticked task must:

- be **completed**, not started — `[/]` files under Log as before, since
  started work isn't done;
- carry **its own resolvable `[[Project]]` prefix** — `detectProjectContext`
  semantics, so a mid-line project link doesn't count; and
- be the **root of its block** — a task nested under something else is not the
  task the project note knows about, and the block that would move isn't it
  either.

Whether the project note ever listed the task is **not** a condition. Ticking
follows the command: the completion is logged either way, so work invented on
the fly in the daily note is filed to its project like anything else. A missing
Todo copy is the normal shape for such a task, so — unlike the command, where
it answers an explicit request about a specific task — the automatic path does
not report it; a copy left `[x]` in Todo still is, since the user may want to
tidy it.

The root rule is where this is narrower than the command, which resolves a
project through the ancestor chain (collectors, project bullets). A ticked
sub-task under a `Push [[Project]]` collector — or under a `- 14:00 Sync`
bullet in the Log — is therefore left alone. That is a deliberately narrow
start: daily notes never group under collectors (see
[key insights](../key-insights.md), *Project Task Consolidation*), so the
prefixed shape `takeProjectTask` produces is the one that matters here, and an
automatic cross-file write should not guess.

## Idempotency

The record that a completion was filed is the log entry itself, so that is what
a repeat run checks (`isCompletionLogged`): a completed task with the same text
inside the source note's sub-section of the project log. This makes running the
command inside a daily note idempotent — the `[x]` it leaves behind wakes the
extension, which finds its own entry already there and writes nothing — and
covers untick/re-tick and any other repeat path, without making "was it listed
in the project?" stand in for "was it already filed?". The check is scoped to
the sub-heading, so the same task completed on another day gets its own entry.

## Phase order and the async gap

The repo's collect → write target → mutate source order holds: the project
write is awaited, and a failure aborts the whole run, leaving the daily note
untouched (the task stays ticked in Todo, and the command remains available
once the user reopens it).

Awaiting a vault write inside an editor extension opens two gaps the previous
synchronous version didn't have:

- **The document may change during the write.** The run re-reads the document
  afterwards and re-locates the trigger line, requiring the line text to still
  match; otherwise it files nothing rather than dropping the children of some
  other task.
- **Two runs may overlap.** Runs are serialized per editor view (a promise
  chain in `createAutoMoveExtension`), so two quick completions can't both see
  the same unfiled task and write it to the project note twice.

## Components

- `src/utils/projectCompletion.ts` (new) — the project-note side of a
  completion, extracted from `completeProjectTask.ts` so the command and the
  extension share one implementation: `buildCompletionEntry`,
  `writeProjectCompletions` (per-entry `CompletionResult`s, so each caller
  decides what is worth reporting), `notifyCompletion`, `isCompletionLogged`,
  plus the editor-free `completeProjectTaskAtLine` used by auto-move.
- `src/utils/autoMove.ts` — `findAutoMoveBlock` exposes the block a trigger
  files (so the caller can tell root from nested, and claim the children);
  `computeAutoMove` gains `moveLineOnly` for tasks whose children now live in
  the project note; `findCompletedTaskLineByText` and `computeLineRangeRemoval`
  serve the Log pass.
- `src/events/autoMoveCompleted.ts` — `runAutoMove` holds the document-level
  logic (testable without CM6) and drives both passes; the extension only wires
  the view to it and captures the ticked line.
- `src/utils/projects.ts` — `ProjectTaskContext` carries the project note's
  `path`, so callers reach the file without re-resolving the link.

No new settings: the behavior follows auto-move, which is likewise always on.

## Testing

- Unit: `findAutoMoveBlock`, `computeAutoMove` under `moveLineOnly`,
  `findCompletedTaskLineByText` (section scoping, ambiguity),
  `computeLineRangeRemoval`, `isCompletionLogged` and `completionSubHeading`.
- Integration (`tests/integration/autoMoveCompleted.plugin.test.ts`, driving
  `runAutoMove` over markdown): project task completed and filed line-only;
  aliased links; a task the project never listed logged all the same; the same
  task logged again on a later day; an entry already in today's sub-section
  (the state the command leaves behind) not logged twice; failed project write
  leaves the daily note untouched; started task, sub-task, and mid-line link
  all fall through to plain auto-move; document edited during the project
  write, both when the trigger can be re-located and when it can't. For the Log
  pass: an entry filed in place with its notes moved and its position kept, a
  plain entry and a nested one both left alone, no second filing when the Todo
  pass just moved the task there, and an ambiguous ticked text left alone.
