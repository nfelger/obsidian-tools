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

When the auto-move extension picks up a ticked task in a daily note's Todo
section, it now asks whether that task belongs to a project. If it does, the
project-note side of `completeProjectTask` runs before the task is filed:

1. **In the project note** — the Todo-section copy is removed and a log entry
   (task line `[x]`, project prefix stripped, plus the task's children) is
   appended under `### [[<daily note>]]`, exactly as the command writes it.
2. **In the daily note** — only the task *line* moves to `## Log`; its children
   went to the project log, matching the command's move-not-copy rule.

A notice reports the completion (and any mismatch), so the user sees that the
children moved rather than vanished.

## Qualifying tasks

The ticked task must:

- be **completed**, not started — `[/]` files under Log as before, since
  started work isn't done;
- carry **its own resolvable `[[Project]]` prefix** — `detectProjectContext`
  semantics, so a mid-line project link doesn't count;
- be the **root of the block auto-move files** — a task nested under something
  else is not the task the project note knows about, and the block that would
  move isn't it either; and
- still have a **live copy in the project's Todo section**.

The last one is where the automatic path deliberately parts with the command.
The command logs a completion even when the copy is missing or already `[x]`,
because the user explicitly asked to close *this* task and the log is the paper
trail. A ticked checkbox is not that request: with nothing to close, an
automatic run writes nothing and the task just files under `## Log` with its
notes intact. That also makes running the command inside a daily note
idempotent — the `[x]` it leaves behind wakes this extension, which finds the
copy already gone and doesn't log the completion twice.

The root rule is the other place this is narrower than the command, which
resolves a project through the ancestor chain (collectors, project bullets). A
ticked sub-task under a `Push [[Project]]` collector is therefore left alone.
That is a deliberately narrow start: daily notes never group under collectors (see
[key insights](../key-insights.md), *Project Task Consolidation*), so the
prefixed shape `takeProjectTask` produces is the one that matters here, and an
automatic cross-file write should not guess.

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
  `writeProjectCompletions`, `notifyCompletion`, plus the editor-free
  `completeProjectTaskAtLine` used by auto-move.
- `src/utils/autoMove.ts` — `findAutoMoveBlock` exposes the block a trigger
  files (so the caller can tell root from nested, and claim the children);
  `computeAutoMove` gains `moveLineOnly` for tasks whose children now live in
  the project note.
- `src/events/autoMoveCompleted.ts` — `runAutoMove` holds the document-level
  logic (testable without CM6); the extension only wires the view to it.
- `src/utils/projects.ts` — `ProjectTaskContext` carries the project note's
  `path`, so callers reach the file without re-resolving the link.

No new settings: the behavior follows auto-move, which is likewise always on.

## Testing

- Unit: `findAutoMoveBlock`, and `computeAutoMove` under `moveLineOnly`.
- Integration (`tests/integration/autoMoveCompleted.plugin.test.ts`, driving
  `runAutoMove` over markdown): project task completed and filed line-only;
  aliased links; no live project copy (including the state the command leaves
  behind) writes nothing; failed project write leaves the daily note untouched;
  started task, sub-task, and mid-line link all fall through to plain
  auto-move; document edited during the project write, both when the trigger
  can be re-located and when it can't.
