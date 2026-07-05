# Design: Complete Project Task

Date: 2026-07-02 (revised 2026-07-03 after manual testing: children move to
the project log extract-log style, the Todo copy is removed instead of
flipped, and completions group under one sub-heading per source note)
Status: Implemented (decisions follow the suggestions in
[the roadmap](../plans/2026-06-12-next-features-roadmap.md) §1).

## Problem

The project loop has a missing piece. Tasks taken from a project note into the
daily note (`takeProjectTask`) leave a `[<]` scheduled copy behind in the
project note. When the user finishes the task in the daily note, closing the
loop is manual: open the project note, find the `[<]` copy, mark it `[x]`, and
write a log entry. The **Complete project task** command does all of that from
the daily note in one step.

## Command Behavior

With the cursor on an incomplete task (or a selection of tasks) in any note
that is not a project note itself:

1. **Resolve the project** for each task via `findProjectLinkInAncestors`
   (own-line link, ancestor link, or a `Push [[Project]]` collector ancestor).
   Tasks with no resolvable project link are skipped with a notice.
2. **In the project note** (one `vault.process` per project):
   - Find the matching task inside the Todo section
     (`projectNoteTaskTargetHeading`), matched by task text with any
     `[[Project]]` or `[[Project|Alias]]` prefix stripped — the same matching
     used by `dropTaskToProject`. If found and not yet completed, remove it
     (and its subtree) from the Todo section — the log entry is the record.
   - Append a log entry under the log heading
     (`logExtractionTargetHeading`): a `### [[<source note>]]` sub-heading
     (one level below the log heading) followed by the completed task line
     (`[x]`, project-link prefix stripped, dedented) and its children. All
     completions from the same source note share a single sub-heading —
     repeat invocations append to the existing sub-section instead of
     repeating the heading. New sub-sections are inserted directly after the
     log heading (reverse-chronological); the heading is created at the end
     of the file when missing.
3. **In the source note**: mark each task `[x]` in place and **move** its
   children into the project log entry (extract-log style). In a daily note
   the existing auto-move extension then carries the task line to `## Log`
   as usual.

Phase order follows the repo convention: collect (read-only) → write project
notes → mutate source. The source is never touched before all project writes
succeed.

## Decisions (roadmap open questions)

- **Project copy not found, or already `[x]`:** still write the log entry and
  complete the source task; show a notice naming the mismatch ("no matching
  task in project" / "already completed in project"). The log is the paper
  trail; the Todo removal is best-effort. Aborting would punish reworded
  tasks. Already-`[x]` copies are left untouched.
- **Move, not copy** (revised after testing): the task's children move to the
  project log entry, like extract log — the daily note keeps only the `[x]`
  task line (which auto-move files under `## Log`), and the project log holds
  the notes. Duplicating the children in both notes proved noisy in practice.
- **Scope:** any note where a project link resolves (mirrors
  `dropTaskToProject`), not just daily notes. The sub-heading links to
  whatever the source note is. Running it inside a project note errors.
- **Multi-select:** supported, like all other transfer commands; tasks are
  grouped per project file.
- **Hotkey-modal key:** `c`.

## Components

- `src/commands/completeProjectTask.ts` — the command, following the
  three-phase structure of `dropTaskToProject.ts`.
- `src/utils/taskMarker.ts` — add `TaskMarker.toCompleted()` (no new
  `TaskState`; Completed already exists).
- `src/utils/tasks.ts` — section-scoped matching: a helper that runs
  `findMatchingTask` within a `findSectionRange` slice and returns
  file-absolute line numbers, so the Todo-section constraint doesn't reimplement
  matching.
- `src/main.ts` — register `complete-project-task` ("Complete project task").
- `src/config.ts` / `src/ui/HotkeyModal.ts` — `c` binding via
  `HOTKEY_BINDINGS` and `COMMAND_REGISTRY`.

No new settings: reuses `projectNoteTaskTargetHeading` and
`logExtractionTargetHeading`.

## Log entry shape

```
## Log

### [[2026-07-02 Thu]]

- [x] Draft rollout plan
	- notes captured during the day

(older entries…)
```

- Task line rendered `[x]` even when the source was `[/]`.
- Children moved verbatim (all children, including completed subtrees — the
  log entry is the day's record, so `selectTransferableChildLines` does not
  apply), re-indented to the project note's indent unit via the standard
  `detectIndentUnit`/`convertIndentUnit` helpers.
- Blank line between heading and content, matching extract-log's block shape;
  later completions from the same note append at the end of the existing
  sub-section.

## Error handling

- Not in a markdown view / cursor not on an incomplete task / no incomplete
  task in selection: same notices as the sibling commands (via
  `findSelectedTaskLines`).
- Inside a project note: "Complete project task: Already in a project note."
- No project link for a task: per-task notice, task skipped, others proceed.
- Project file missing (broken link): per-task notice, task skipped.
- Mismatch notices as described under Decisions.
- Success notice reports the number of tasks completed and the project names,
  with per-task mismatch details appended when any occurred.

## Testing

- Unit tests for the section-scoped matching helper and
  `TaskMarker.toCompleted()`.
- Integration tests (markdown-first, `tests/integration/`):
  - happy path: `[<]` copy removed from Todo, log entry written, source task
    `[x]` with children moved out
  - task under a `Push [[Project]]` collector resolves the project
  - project copy missing → log entry still written, notice shown
  - project copy already `[x]` → left untouched, log entry written
  - multi-select across two projects → grouped writes, one sub-heading per
    project per run
  - one-by-one completions append under the existing same-note sub-heading
  - started `[/]` source task → `[x]` everywhere
  - log heading missing in project → created at end of file
  - indent-unit conversion into the project note
  - project write failure → source untouched (children included)
