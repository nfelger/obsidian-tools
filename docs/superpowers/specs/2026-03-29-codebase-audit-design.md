# Codebase Audit — Bullet Flow Plugin

**Date:** 2026-03-29
**Scope:** Full subsystem health review. Goal: catalogue issues, set up codebase for future enhancements (new task types, richer project interactions, more robust scheduling).
**Format:** Subsystem health report — each section has a summary plus findings tagged by type.

**Finding tags:**
- `bug` — incorrect behaviour observed or directly traceable in code
- `dead-code` — unused declarations that add noise and maintenance burden
- `smell` — working code with structural or consistency problems
- `extensibility-blocker` — code that is correct today but will require invasive changes to support planned features
- `boundary` — Obsidian API leaking past the domain boundary (violates CLAUDE.md principle)

---

## 1. Shared Utilities & Types

### Health summary
`config.ts`, `commandSetup.ts`, `indent.ts` are clean and focused. `listItems.ts` and `wikilinks.ts` are mostly sound but have one boundary violation each. `types.ts` has accumulated dead declarations from a partially-completed refactor.

### Findings

**1.1** `dead-code` — `types.ts` contains `CommandResult`, `TaskTransferResult`, `ExtractLogResult`, `createTaskTransferResult`, `createErrorResult`, and `createValidationResult` (lines 170–242). No command uses any of these; all commands issue `new Notice()` directly. These were the foundation of a planned result-object refactor that was never wired up. They add ~70 lines of confusion about how errors are supposed to be handled.

**1.2** `boundary` — `findFirstWikiLink()` in `wikilinks.ts` (line 166) takes a raw `MetadataCache` parameter instead of going through the `LinkResolver` interface. It duplicates what `findFirstResolvedLink()` does via the proper adapter. It is only called by `extractLog.ts`. This creates two parallel wikilink resolution paths, one of which bypasses the abstraction CLAUDE.md requires.

**1.3** `dead-code` — `ObsidianLinkResolver.resolveToTFile()` in `wikilinks.ts` (line 36) is marked `@deprecated` and has no callers in the current codebase. It exposes `TFile` past the domain boundary; removing it cleans up both the dead code and the boundary violation.

**1.4** `smell` — `getListItemAtLine()` in `listItems.ts` (line 33) is a linear scan over all list items on every call. `buildLineToItemMap()` exists in the same file to build an O(1) lookup map, but callers pass fresh list-item arrays to functions that call `getListItemAtLine` in loops (e.g. ancestor walking in `projects.ts:findProjectLinkInAncestors`). In complex notes this is O(n²). Not the source of the observed hang, but a latent performance issue.

---

## 2. Task State Machine (`tasks.ts`)

### Health summary
`tasks.ts` at 614 lines is the largest file and the clearest blob candidate. It contains five distinct concerns: the `TaskMarker`/`TaskState` state machine; heading-section utilities; single-task insertion with deduplication; batch insertion; and task-range scanning. The state machine core (`TaskMarker`, `TaskState`) is clean and well-tested. The surrounding utilities are correct but tightly coupled in ways that will resist extension.

### Findings

**2.1** `extensibility-blocker` — `TaskMarker.fromLine()` (line 46) is a closed switch statement over hardcoded characters (`' '`, `'/'`, `'x'`, `'X'`, `'>'`, `'<'`). `isIncomplete()` hardcodes Open and Started. `isTerminal()` hardcodes Completed and Migrated. Adding a new task type (e.g. mood `[m]`, event `[e]`) requires modifying at least three locations in this file plus all callsites that rely on these predicates. There is no registration mechanism.

**2.2** `smell` — `findTopLevelTasksInRange()` (line 220) declares its `listItems` parameter as `any[]` instead of `ListItem[]`. `ListItem` is the correct domain type and exists in `types.ts`. This is the only use of `any` for list items in the codebase; it weakens type checking in the most complex utility function in the file.

**2.3** `smell` — Single-task deduplication (`insertTaskWithDeduplication`, lines 501–537) duplicates the logic in the batch version (`insertMultipleTasksWithDeduplication`, lines 577–614). The single-task version has one caller (`pullTaskUp` once did; it now uses the batch version). It is effectively dead logic that adds maintenance surface.

**2.4** `smell` — The file conflates two unrelated abstraction levels: low-level text predicates (`isIncompleteTask`, `markTaskAsScheduled`) and high-level document operations (`insertUnderTargetHeading`, `findSectionRange`). Splitting into `taskPredicates.ts` and keeping document operations in `tasks.ts` (or a dedicated `insertion.ts`) would make the state machine dependency graph easier to reason about, and is a prerequisite for extensible task types.

---

## 3. Periodic Notes Service (`periodicNotes.ts`)

### Health summary
The date arithmetic is correct and well-tested. The ISO week logic is solid. The main structural problem is a dual-API surface: `PeriodicNoteService` (a class) and standalone exported functions exist side by side, and different commands use different styles with no apparent rule.

### Findings

**3.1** `smell` — Dual API: `PeriodicNoteService` wraps standalone functions of the same names. `autoMoveCompleted.ts` instantiates the class; `migrateTask.ts` and `pullTaskUp.ts` import the standalone functions directly. There is no difference in behaviour. This creates an implicit two-tier API with no guidance on which to use. New commands can't tell which style is correct.

**3.2** `dead-code` — Orphaned JSDoc block at line 349 (immediately above `dateIsInPeriod`). The comment reads "Calculate the path to the next periodic note" and describes `getNextNotePath`, but `getNextNotePath` appears 150 lines later at line 501 — the comment was stranded when function order was changed. It currently misdocuments `dateIsInPeriod`.

**3.3** `smell` — `normalizeSettings()` (line 26) accepts `string | Partial<BulletFlowSettings>`. The string overload exists for legacy callers that passed only a folder name. No current command caller uses this path; all pass full settings objects. The overload adds noise to every path-formatting call signature and obscures the real type contract.

**3.4** `smell` — `getNextNotePath()` (line 501) opens with `if (!noteInfo) return ''`. The parameter type is `NoteInfo`, not `NoteInfo | null`. The guard defends against a case the type system says cannot happen. If the intent is robustness, the type should be widened; otherwise the check should be removed.

---

## 4. Project Utilities (`projects.ts`)

### Health summary
`isProjectNote`, `getProjectName`, `isProjectLink`, `findProjectLinkInAncestors`, `parseProjectKeywords`, and `findCollectorTask` are all correct and well-tested. One function is dead and broken; there is a minor indentation inconsistency that causes visible differences in output.

### Findings

**4.1** `dead-code` + `bug` — `removeTaskAndChildren()` (line 220) is not called by any command. It also contains a broken identity calculation: `adjustedLine` at line 234 is always equal to `taskLine` regardless of the branch taken — the conditional computes the same value in both paths. The function would not work correctly if it were called. It should be deleted.

**4.2** `smell` — `insertUnderCollectorTask()` (line 180) hardcodes a 4-space indent (`collectorIndent + 4`). `takeProjectTask.ts` builds children content using `indentLines(..., 4)` in the collector path but builds the same content with inline 2-space indentation (`'  ' + line`) in the deduplication heading path. Tasks taken from the same project note end up with different child indentation depending on whether a collector task was found.

---

## 5. Task Transfer Commands

### Health summary
`migrateTask` and `pushTaskDown` are solid. `extractLog` is functionally correct but has a boundary violation and a minor redundancy. `pullTaskUp` has a confirmed bug reported during real use.

### Findings

**5.1** `bug` — `pullTaskUp` inserts into `plugin.settings.periodicNoteTaskTargetHeading` (line 132), which defaults to `## Log`. This is the same heading used for incoming migrated tasks. When pulling a task up from a daily note to a weekly note, the task lands under `## Log` instead of under the weekly note's task list. Users who keep Log and Todo as separate sections in their weekly/monthly notes will see tasks in the wrong place. This is the "Pull up from daily to weekly adds to Log, not Todo" issue in the ideas list.

**5.2** `smell` — Children indentation is duplicated across commands with variations. `migrateTask` uses `dedentLinesByAmount` then joins directly. `pushTaskDown` and `pullTaskUp` inline `line ? '  ' + line : line`. `takeProjectTask` uses `indentLines(..., 4)` for one path and `'  ' + line` for another. Four commands, three indentation strategies. This is the root of the indentation bugs reported.

**5.3** `smell` — `extractLog.ts` calls `parseTargetHeading(plugin.settings.logExtractionTargetHeading)` twice (lines 118 and 159), destructuring into `targetLevel`/`targetLevel2` and discarding the duplicate. The second call is an oversight; the result from the first call should be reused.

**5.4** `boundary` — `extractLog.ts` calls `findFirstWikiLink(parentText, sourcePath, plugin.app.metadataCache)` (line 77) with a raw `MetadataCache` argument. This is the only callsite of `findFirstWikiLink` and bypasses the `LinkResolver` abstraction. It should use `findFirstResolvedLink` with an `ObsidianLinkResolver` instead. (Connects to finding 1.2.)

---

## 6. Project Commands

### Health summary
`dropTaskToProject` and `takeProjectTask` are structurally clean and handle multi-task selection well. `finishProject` is functionally correct but has an operation-ordering problem that leaves the file in a partially-modified state if a later step fails.

### Findings

**6.1** `smell` — `finishProject` (line 40) calls `vault.process(file, ...)` to add the completion date *before* confirming the archive folder exists (line 44) or that the rename target is available (line 32 checks the target, but folder creation comes after content modification). If the folder can't be created, the file has already been modified but not archived. The safe order is: validate everything first, create folder, modify content, rename.

**6.2** `smell` — `finishProject` issues two sequential async calls (`vault.process` then `fileManager.renameFile`) without atomicity. A crash or forced quit between them leaves the note with a `completed:` date but still in the projects folder under its original name. This is an inherent constraint of the Obsidian API, but worth documenting and potentially mitigating with a guard on re-entry (the `file.basename.startsWith('✅')` check on line 23 already partially does this).

---

## 7. Auto-Move Subsystem

### Health summary
The architectural split between pure computation (`autoMove.ts`) and the CM6 adapter (`autoMoveCompleted.ts`) is correct and the pure functions are well-tested. The CM6 event handling has two distinct bugs that together explain the observed hard hang.

### Findings

**7.1** `bug` — **Primary hang candidate.** `performAutoMove` (line 90) re-reads the document via `view.state.doc.toString()` after the `setTimeout(0)` delay but continues to use `triggerLine` from when the trigger was *detected*, not from the current document state. Any edit that arrives between detection and execution (including the user opening and closing the HotkeyModal, which can dispatch editor events) can shift line positions. If `lines[triggerLine]` now points to a different task — one that is complete and inside the Todo section — `computeAutoMove` will process the wrong line and dispatch a spurious move. That move triggers another update listener call; the annotation check stops the recursion, but the document is now in an inconsistent state. Depending on timing, repeated modal open/close cycles in a complex note could build up a queue of stale `triggerLine` values firing in sequence.

**7.2** `bug` — **Secondary hang candidate.** Multiple rapid edits (e.g. completing several tasks with a macro or paste) queue multiple independent `setTimeout(0)` callbacks, each holding a different `triggerLine`. There is no guard to serialise these or discard stale ones. Each callback calls `view.dispatch()` synchronously; if callbacks interleave with other Obsidian event processing, the cumulative effect on a large note could block the main thread long enough to appear as a hang.

**7.3** `smell` — The `setTimeout(0)` escape pattern is the correct CM6 approach for avoiding recursive dispatch, but the intent and the dangers are not documented. The code comment says "avoid recursive dispatch" but does not explain that `triggerLine` is a snapshot that must be re-validated against the current document before use.

---

## 8. Build & Test Running

### Health summary
The test suite is healthy with 463 tests across 18 files. The build tooling has a first-run friction problem and no CI harness.

### Findings

**8.1** `bug` — `npm test` fails with `vitest: not found` on a fresh clone until `npm install` is run. This is standard Node behaviour, but it's caught at least one session already (visible in this audit's git log). The fix is ensuring the project README or a session hook runs `npm install` when `node_modules` is absent.

**8.2** `smell` — No CI configuration. Regressions are only caught when tests are run locally. Given the plugin is approaching the point where multiple related features interact (task scheduling, project commands, auto-move), a CI run on push would catch cross-feature breakage before it compounds.

**8.3** `smell` — `npm run build` is not part of the test pipeline. TypeScript type errors in non-tested code paths (e.g. the dead `CommandResult` types) are not caught by `vitest` alone. A build step in CI would surface these.

---

## 9. Documentation

### Health summary
`CLAUDE.md`, `tests/CLAUDE.md`, and `docs/key-insights.md` are accurate and actively maintained. One diagram is incomplete; one architectural constraint critical for future work is undocumented.

### Findings

**9.1** `smell` — The task state machine diagram in `CLAUDE.md` shows `[ ]` (Open) and `[/]` (Started) as the entry states, but `[/]` (Started) does not appear as a node — only as a label on the same line as `[ ]`. The diagram also does not show that `[/]` can be directly migrated (`[>]`) or scheduled (`[<]`). This creates ambiguity for anyone adding a new task type about how Started participates in transitions.

**9.2** `smell` — `docs/key-insights.md` documents ISO week edge cases and wikilink parsing, but does not document the `TaskMarker` extensibility constraint: that `fromLine()`, `isIncomplete()`, `isTerminal()`, `canMigrate()`, and `canReopen()` all hardcode known states and must all be updated together when adding a new task type. This is exactly the kind of non-obvious constraint that key-insights.md exists to capture, and the planned custom bullet types will run into it immediately.

---

## Summary Table

| # | Finding | Type | File | Priority impact |
|---|---------|------|------|-----------------|
| 7.1 | Stale `triggerLine` in performAutoMove | bug | autoMoveCompleted.ts | Hard hang |
| 7.2 | No guard on concurrent setTimeout callbacks | bug | autoMoveCompleted.ts | Hard hang |
| 5.1 | pullTaskUp inserts into Log not Todo | bug | pullTaskUp.ts | Wrong output |
| 4.1 | removeTaskAndChildren dead + broken | dead-code/bug | projects.ts | Safety |
| 6.1 | finishProject modifies before validating | smell | finishProject.ts | Data integrity |
| 2.1 | TaskMarker closed switch, no extension point | extensibility-blocker | tasks.ts | New task types |
| 1.2 | findFirstWikiLink bypasses LinkResolver | boundary | wikilinks.ts | Architecture |
| 5.4 | extractLog uses raw MetadataCache | boundary | extractLog.ts | Architecture |
| 1.1 | Dead CommandResult types | dead-code | types.ts | Noise |
| 1.3 | resolveToTFile deprecated + unused | dead-code | wikilinks.ts | Noise |
| 3.2 | Orphaned JSDoc | dead-code | periodicNotes.ts | Noise |
| 2.3 | insertTaskWithDeduplication redundant | dead-code | tasks.ts | Noise |
| 5.2 | Inconsistent child indentation across commands | smell | multiple | Output bugs |
| 4.2 | 4-space vs 2-space indent by insertion path | smell | projects.ts + takeProjectTask | Output bugs |
| 3.1 | Dual API (class + standalone functions) | smell | periodicNotes.ts | Confusion |
| 2.4 | tasks.ts mixed abstraction levels | smell | tasks.ts | Extensibility |
| 1.4 | getListItemAtLine O(n) in loops | smell | listItems.ts | Performance |
| 5.3 | parseTargetHeading called twice | smell | extractLog.ts | Minor |
| 6.2 | finishProject non-atomic rename | smell | finishProject.ts | Minor |
| 3.3 | normalizeSettings legacy string overload | smell | periodicNotes.ts | Noise |
| 3.4 | Null guard on non-nullable type | smell | periodicNotes.ts | Noise |
| 7.3 | setTimeout(0) pattern undocumented | smell | autoMoveCompleted.ts | Maintainability |
| 8.1 | npm test fails without npm install | bug | — | DX |
| 8.2 | No CI | smell | — | Safety net |
| 8.3 | Build not in test pipeline | smell | — | Safety net |
| 9.1 | State diagram incomplete | smell | CLAUDE.md | Onboarding |
| 9.2 | TaskMarker extensibility undocumented | smell | key-insights.md | New task types |
