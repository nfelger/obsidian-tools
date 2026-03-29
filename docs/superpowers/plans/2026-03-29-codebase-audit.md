# Codebase Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all confirmed bugs, remove dead code, and resolve structural issues identified in the audit to leave the codebase clean and ready for new task types and project features.

**Architecture:** Bug fixes first (P0), then structural cleanup (P1), then documentation (P2). Each task is independently committable. TDD throughout — write the failing test before touching implementation.

**Tech Stack:** TypeScript, Vitest, Obsidian Plugin API, CodeMirror 6

**User Verification:** NO

---

## File Map

Files created or significantly restructured by this plan:

| File | Change |
|---|---|
| `src/utils/autoMove.ts` | Add `findAutoMoveTriggerLine()` |
| `src/events/autoMoveCompleted.ts` | Refactor `performAutoMove` to scan fresh |
| `src/types.ts` | Change default heading; delete dead types |
| `src/utils/tasks.ts` | Add `buildTaskContent()`; delete `insertTaskWithDeduplication` |
| `src/utils/taskMarker.ts` | **New** — extracted from tasks.ts |
| `src/utils/wikilinks.ts` | Delete `findFirstWikiLink`, `resolveToTFile` |
| `src/utils/periodicNotes.ts` | Fix dual API; remove string overload |
| `src/utils/projects.ts` | Delete `removeTaskAndChildren` |
| `src/utils/listItems.ts` | Fix O(n²) in `findProjectLinkInAncestors` |
| `src/commands/extractLog.ts` | Use `ObsidianLinkResolver`; fix double parse |
| `src/commands/pushTaskDown.ts` | Use `buildTaskContent`; use `PeriodicNoteService` |
| `src/commands/pullTaskUp.ts` | Use `buildTaskContent`; use `PeriodicNoteService` |
| `src/commands/migrateTask.ts` | Use `PeriodicNoteService` |
| `src/commands/takeProjectTask.ts` | Use `buildTaskContent`; use `PeriodicNoteService` |
| `src/commands/finishProject.ts` | Fix operation order |
| `src/commands/dropTaskToProject.ts` | Use `PeriodicNoteService` |
| `.github/workflows/ci.yml` | **New** — test + build on every push |
| `docs/key-insights.md` | Document TaskMarker extension constraint |
| `CLAUDE.md` | Fix state diagram; update settings table default |
| `CHANGELOG.md` | Document user-facing changes |

---

## P0 — Bug Fixes

### Task 1: Fix autoMove hard hang

**Goal:** Eliminate the stale-`triggerLine` bug and prevent spurious moves in complex notes.

**Audit findings:** 7.1, 7.2, 7.3

**Files:**
- Modify: `src/utils/autoMove.ts`
- Modify: `src/events/autoMoveCompleted.ts`
- Modify: `tests/unit/autoMove.test.ts`

**Acceptance Criteria:**
- [ ] `findAutoMoveTriggerLine` exported from `autoMove.ts` and tested
- [ ] `performAutoMove` no longer takes a `triggerLine` parameter; scans document fresh
- [ ] `detectAutoMoveTrigger` replaced by boolean `detectAutoMoveCandidate`
- [ ] All existing autoMove tests pass

**Verify:** `npx vitest run tests/unit/autoMove.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Write failing tests for `findAutoMoveTriggerLine`**

Add to `tests/unit/autoMove.test.ts`:

```typescript
import {
    findRootAncestorLine,
    collectBlock,
    findLogInsertionLine,
    computeAutoMove,
    findAutoMoveTriggerLine   // will not exist yet
} from '../../src/utils/autoMove';

describe('findAutoMoveTriggerLine', () => {
    it('returns null when todo section absent', () => {
        expect(findAutoMoveTriggerLine('## Log\n- [x] Done\n', '## Todo')).toBeNull();
    });

    it('returns null when no completed/started tasks in todo section', () => {
        expect(findAutoMoveTriggerLine('## Todo\n- [ ] Open\n', '## Todo')).toBeNull();
    });

    it('returns line of first completed task in todo section', () => {
        const doc = '## Todo\n- [x] Done\n- [ ] Open\n';
        expect(findAutoMoveTriggerLine(doc, '## Todo')).toBe(1);
    });

    it('returns line of started task', () => {
        const doc = '## Todo\n- [/] In progress\n';
        expect(findAutoMoveTriggerLine(doc, '## Todo')).toBe(1);
    });

    it('ignores completed tasks outside todo section', () => {
        const doc = '## Log\n- [x] Already logged\n## Todo\n- [ ] Open\n';
        expect(findAutoMoveTriggerLine(doc, '## Todo')).toBeNull();
    });

    it('returns first completed task when multiple exist', () => {
        const doc = '## Todo\n- [ ] Open\n- [x] First done\n- [x] Second done\n';
        expect(findAutoMoveTriggerLine(doc, '## Todo')).toBe(2);
    });
});
```

Run: `npx vitest run tests/unit/autoMove.test.ts` → FAIL (function not exported)

- [ ] **Step 2: Add `findAutoMoveTriggerLine` to `autoMove.ts`**

Add after the `lineToOffset` function at the bottom of `src/utils/autoMove.ts`:

```typescript
/**
 * Find the line number of the first completed or started task in the Todo section.
 * Called fresh after each setTimeout to avoid stale line references.
 *
 * @param docText - Full document text
 * @param todoHeading - The Todo section heading (e.g., "## Todo")
 * @returns Line number (0-indexed), or null if none found
 */
export function findAutoMoveTriggerLine(
    docText: string,
    todoHeading: string
): number | null {
    const lines = docText.split('\n');
    const todoRange = findSectionRange(lines, todoHeading);
    if (!todoRange) return null;

    for (let i = todoRange.start + 1; i < todoRange.end; i++) {
        const marker = TaskMarker.fromLine(lines[i]);
        if (marker && (marker.state === TaskState.Completed || marker.state === TaskState.Started)) {
            return i;
        }
    }
    return null;
}
```

Run: `npx vitest run tests/unit/autoMove.test.ts` → all pass

- [ ] **Step 3: Refactor `autoMoveCompleted.ts`**

Replace the entire contents of `src/events/autoMoveCompleted.ts` with:

```typescript
/**
 * CM6 extension that auto-moves completed and started tasks from ## Todo to ## Log in daily notes.
 *
 * Design: detectAutoMoveCandidate checks if any change might have completed/started a task.
 * If so, schedules performAutoMove via setTimeout(0) to run after CM6 finishes its transaction.
 * performAutoMove re-scans the document fresh — it does NOT use the line captured at detection
 * time, avoiding the stale-reference bug where intervening edits shift line numbers.
 */

import { EditorView, ViewUpdate } from '@codemirror/view';
import { Annotation, Extension } from '@codemirror/state';
import { MarkdownView } from 'obsidian';
import type BulletFlowPlugin from '../main';
import { PeriodicNoteService } from '../utils/periodicNotes';
import { TaskMarker, TaskState } from '../utils/tasks';
import { computeAutoMove, findAutoMoveTriggerLine } from '../utils/autoMove';

const autoMoveAnnotation = Annotation.define<boolean>();

export function createAutoMoveExtension(plugin: BulletFlowPlugin): Extension {
    return EditorView.updateListener.of((update: ViewUpdate) => {
        if (!update.docChanged) return;
        if (update.transactions.some(tr => tr.annotation(autoMoveAnnotation))) return;
        if (!detectAutoMoveCandidate(update)) return;

        const view = update.view;
        setTimeout(() => {
            try {
                performAutoMove(plugin, view);
            } catch (e: any) {
                console.error('autoMoveCompleted error:', e);
            }
        }, 0);
    });
}

/**
 * Returns true if any change in the update transitioned a task TO completed or started.
 * Only determines whether to schedule a move — the actual line is found fresh later.
 */
function detectAutoMoveCandidate(update: ViewUpdate): boolean {
    const newDoc = update.state.doc;
    const oldDoc = update.startState.doc;
    let found = false;

    update.changes.iterChanges((_fromA, _toA, fromB, toB) => {
        if (found) return;
        const startLine = newDoc.lineAt(fromB).number;
        const endLine = newDoc.lineAt(Math.min(toB, newDoc.length)).number;

        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const newLine = newDoc.line(lineNum);
            const newMarker = TaskMarker.fromLine(newLine.text);
            if (!newMarker || (newMarker.state !== TaskState.Completed && newMarker.state !== TaskState.Started)) continue;

            const oldPos = update.changes.mapPos(newLine.from, -1);
            if (oldPos >= 0 && oldPos <= oldDoc.length) {
                const oldLine = oldDoc.lineAt(oldPos);
                const oldMarker = TaskMarker.fromLine(oldLine.text);
                if (oldMarker && oldMarker.state === newMarker.state) continue;
            }

            found = true;
            return;
        }
    });

    return found;
}

/**
 * Scan the current document fresh for the first completed/started task in the Todo section
 * and move it to Log. Called via setTimeout(0) to avoid CM6 re-entrancy.
 */
function performAutoMove(plugin: BulletFlowPlugin, view: EditorView): void {
    const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView?.file) return;

    const noteService = new PeriodicNoteService(plugin.settings);
    const noteInfo = noteService.parseNoteType(markdownView.file.basename);
    if (!noteInfo || noteInfo.type !== 'daily') return;

    const docText = view.state.doc.toString();
    const todoHeading = plugin.settings.periodicNoteTaskTargetHeading;
    const logHeading = plugin.settings.dailyNoteLogHeading;

    const triggerLine = findAutoMoveTriggerLine(docText, todoHeading);
    if (triggerLine === null) return;

    const result = computeAutoMove(docText, triggerLine, todoHeading, logHeading);
    if (!result) return;

    view.dispatch({
        changes: result.changes,
        annotations: autoMoveAnnotation.of(true)
    });
}
```

Run: `npx vitest run` → all pass

- [ ] **Step 4: Commit**

```bash
git add src/utils/autoMove.ts src/events/autoMoveCompleted.ts tests/unit/autoMove.test.ts
git commit -m "fix: eliminate stale triggerLine in autoMove — scan document fresh on each callback"
```

---

### Task 2: Fix `periodicNoteTaskTargetHeading` default

**Goal:** Change the default insertion heading from `## Log` to `## Todo` so migrate/push/pull operations target the task list, not the log.

**Audit findings:** 5.1

**Files:**
- Modify: `src/types.ts`
- Modify: `tests/integration/pullTaskUp.plugin.test.ts`
- Modify: `tests/integration/pushTaskDown.plugin.test.ts`
- Modify: `tests/integration/migrateTask.plugin.test.ts`
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`

**Acceptance Criteria:**
- [ ] `DEFAULT_SETTINGS.periodicNoteTaskTargetHeading` is `'## Todo'`
- [ ] All integration tests updated to use `## Todo` as the target section
- [ ] CHANGELOG has a user-facing entry for this change

**Verify:** `npx vitest run` → all pass

**Steps:**

- [ ] **Step 1: Change the default in `src/types.ts`**

```typescript
// Line ~131 in types.ts
export const DEFAULT_SETTINGS: BulletFlowSettings = {
    diaryFolder: '+Diary',
    periodicNoteTaskTargetHeading: '## Todo',   // was '## Log'
    // ... rest unchanged
};
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npx vitest run
```

Integration tests for migrateTask, pushTaskDown, pullTaskUp will fail because their `targetContent` uses `## Log` but the command now inserts under `## Todo`.

- [ ] **Step 3: Update integration tests**

In every failing test, change `targetContent` that uses `## Log` as the insertion target to `## Todo`. For example, in `tests/integration/pullTaskUp.plugin.test.ts`:

```typescript
// BEFORE:
targetContent: `## Log
`,

// AFTER:
targetContent: `## Todo
`,
```

Apply this change to all three test files. For deduplication tests that pre-populate an existing task in the target, move that task under `## Todo`:

```typescript
// BEFORE:
targetContent: `## Log
- [ ] Review PR
  - Existing note`,

// AFTER:
targetContent: `## Todo
- [ ] Review PR
  - Existing note`,
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run
```

All tests should pass.

- [ ] **Step 5: Update CLAUDE.md settings table**

In the Target heading settings table, change the Default for `periodicNoteTaskTargetHeading` from `## Log` to `## Todo`.

- [ ] **Step 6: Add CHANGELOG entry**

Add to `CHANGELOG.md` under a new `## Unreleased` section:

```markdown
## Unreleased

### Changed
- `periodicNoteTaskTargetHeading` default changed from `## Log` to `## Todo`. Tasks moved by Migrate, Push Down, Pull Up, and Take Project Task now land in `## Todo` by default. Existing users with saved settings are unaffected.
```

- [ ] **Step 7: Commit**

```bash
git add src/types.ts tests/integration/pullTaskUp.plugin.test.ts \
    tests/integration/pushTaskDown.plugin.test.ts \
    tests/integration/migrateTask.plugin.test.ts \
    CLAUDE.md CHANGELOG.md
git commit -m "fix: change periodicNoteTaskTargetHeading default from Log to Todo"
```

---

### Task 3: Fix `finishProject` operation order

**Goal:** Ensure the archive folder exists before modifying file content, preventing partial state on failure.

**Audit findings:** 6.1

**Files:**
- Modify: `src/commands/finishProject.ts`
- Modify: `tests/integration/finishProject.plugin.test.ts`

**Acceptance Criteria:**
- [ ] Archive folder is created (if missing) before `vault.process` modifies content
- [ ] Test confirms folder creation precedes content modification

**Verify:** `npx vitest run tests/integration/finishProject.plugin.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Write a failing test for operation order**

Add to `tests/integration/finishProject.plugin.test.ts`:

```typescript
it('creates archive folder before modifying file content', async () => {
    const callOrder: string[] = [];
    const result = await testFinishProject({
        source: '---\ntitle: My Project\n---\n\n## Todo\n- [ ] Task',
        sourceFileName: 'My Project',
        archiveFolderExists: false,
        onCreateFolder: () => callOrder.push('createFolder'),
        onProcess: () => callOrder.push('process'),
    });

    expect(callOrder).toEqual(['createFolder', 'process']);
    expect(result.notice).toContain('archived');
});
```

Check the test helper (`tests/helpers/finishProjectPluginTestHelper.ts`) to see if `onCreateFolder`/`onProcess` hooks exist; if not, add them to the helper alongside this test.

Run: `npx vitest run tests/integration/finishProject.plugin.test.ts` → FAIL

- [ ] **Step 2: Reorder operations in `src/commands/finishProject.ts`**

Replace the body of `finishProject` from the conflict-check onwards:

```typescript
// After the existing startsWith('✅') and conflict checks...

const projectName = file.basename;
const archiveFolder = plugin.settings.projectArchiveFolder;
const newPath = `${archiveFolder}/✅ ${projectName}.md`;

if (plugin.app.vault.getAbstractFileByPath(newPath)) {
    new Notice(`finishProject: ${newPath} already exists.`);
    return;
}

const today = plugin.getToday();
const dateStr = formatDate(today);

// 1. Create archive folder first (safe to do before modifying content)
if (!plugin.app.vault.getAbstractFileByPath(archiveFolder)) {
    await plugin.app.vault.createFolder(archiveFolder);
}

// 2. Modify content
await plugin.app.vault.process(file, (content: string) => {
    return addCompletedDate(content, dateStr);
});

// 3. Rename/move
await plugin.app.fileManager.renameFile(file, newPath);

new Notice(`finishProject: ${projectName} archived.`);
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/integration/finishProject.plugin.test.ts
```

All pass.

- [ ] **Step 4: Commit**

```bash
git add src/commands/finishProject.ts tests/integration/finishProject.plugin.test.ts
git commit -m "fix: create archive folder before modifying content in finishProject"
```

---

### Task 4: Add CI test step and local pretest hook

**Goal:** Ensure tests run in CI on every push and that `npm test` works without a manual `npm install` first.

**Audit findings:** 8.1, 8.2, 8.3

**Files:**
- Modify: `.github/workflows/release-on-push.yml`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`

**Acceptance Criteria:**
- [ ] `npm test` on a fresh checkout with no `node_modules` auto-installs deps and runs tests
- [ ] `release-on-push.yml` runs tests before building
- [ ] New `ci.yml` runs tests + build on all pushes to `claude/**` and PRs to `main`

**Verify:** `npm test` in a directory without `node_modules` → installs deps, tests pass

**Steps:**

- [ ] **Step 1: Add `pretest` to `package.json`**

```json
"scripts": {
    "pretest": "node -e \"require('fs').existsSync('node_modules/.bin/vitest') || require('child_process').execSync('npm install', {stdio: 'inherit'})\"",
    "test": "vitest run",
    ...
}
```

- [ ] **Step 2: Add test step to `release-on-push.yml`**

After the `Install dependencies` step and before any build step, add:

```yaml
- name: Run tests
  run: npm test
```

- [ ] **Step 3: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches:
      - 'claude/**'
  pull_request:
    branches:
      - main

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npm test
      - name: Build
        run: npm run build
```

- [ ] **Step 4: Commit**

```bash
git add package.json .github/workflows/release-on-push.yml .github/workflows/ci.yml
git commit -m "ci: add test step to release workflow; add CI workflow for branches and PRs"
```

---

## P1 — Structural Cleanup

### Task 5: Delete dead code

**Goal:** Remove declarations that are never called and add noise to the codebase.

**Audit findings:** 1.1, 1.3, 2.3, 3.2, 4.1

**Files:**
- Modify: `src/types.ts`
- Modify: `src/utils/wikilinks.ts`
- Modify: `src/utils/tasks.ts`
- Modify: `src/utils/periodicNotes.ts`
- Modify: `src/utils/projects.ts`

**Acceptance Criteria:**
- [ ] `CommandResult`, `TaskTransferResult`, `ExtractLogResult`, `createTaskTransferResult`, `createErrorResult`, `createValidationResult` deleted from `types.ts`
- [ ] `ObsidianLinkResolver.resolveToTFile()` deleted from `wikilinks.ts`
- [ ] `insertTaskWithDeduplication` (single-task version) deleted from `tasks.ts`
- [ ] Orphaned JSDoc block at line 349 of `periodicNotes.ts` deleted
- [ ] `removeTaskAndChildren` deleted from `projects.ts`
- [ ] All tests still pass

**Verify:** `npx vitest run` → all pass; `npm run build` → no errors

**Steps:**

- [ ] **Step 1: Delete dead types from `src/types.ts`**

Remove lines 170–242: the `CommandResult` type alias, `TaskTransferResult`, `ExtractLogResult`, `createTaskTransferResult`, `createErrorResult`, and `createValidationResult`. Verify no imports of these names exist anywhere:

```bash
grep -r "CommandResult\|TaskTransferResult\|ExtractLogResult\|createTaskTransferResult\|createErrorResult\|createValidationResult" src/ tests/
```

Expected: no matches (only the declaration lines themselves, which are being deleted).

- [ ] **Step 2: Delete `resolveToTFile` from `src/utils/wikilinks.ts`**

Remove the `resolveToTFile` method and its `@deprecated` JSDoc from `ObsidianLinkResolver`. Verify no callers:

```bash
grep -r "resolveToTFile" src/ tests/
```

Expected: no matches.

- [ ] **Step 3: Delete `insertTaskWithDeduplication` from `src/utils/tasks.ts`**

Remove the single-task `insertTaskWithDeduplication` function (approximately lines 501–537). Verify no callers:

```bash
grep -rn "insertTaskWithDeduplication[^s]" src/ tests/
```

Expected: no matches (the batch version `insertMultipleTasksWithDeduplication` is unaffected).

- [ ] **Step 4: Delete orphaned JSDoc from `src/utils/periodicNotes.ts`**

Remove the misplaced comment block at line 349 that reads "Calculate the path to the next periodic note" but sits above `dateIsInPeriod`.

- [ ] **Step 5: Delete `removeTaskAndChildren` from `src/utils/projects.ts`**

Remove the entire `removeTaskAndChildren` function (approximately lines 220–240). Verify no callers:

```bash
grep -r "removeTaskAndChildren" src/ tests/
```

Expected: no matches.

- [ ] **Step 6: Run tests and build**

```bash
npx vitest run && npm run build
```

All pass with no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/utils/wikilinks.ts src/utils/tasks.ts \
    src/utils/periodicNotes.ts src/utils/projects.ts
git commit -m "refactor: delete dead code — CommandResult types, resolveToTFile, insertTaskWithDeduplication, orphaned JSDoc, removeTaskAndChildren"
```

---

### Task 6: Fix boundary violations in `extractLog.ts` and `wikilinks.ts`

**Goal:** Route wikilink resolution through `ObsidianLinkResolver`; eliminate the raw `MetadataCache` path; fix the double `parseTargetHeading` call.

**Audit findings:** 1.2, 5.3, 5.4

**Files:**
- Modify: `src/commands/extractLog.ts`
- Modify: `src/utils/wikilinks.ts`
- Modify: `tests/integration/extractLog.plugin.test.ts` (verify unchanged)

**Acceptance Criteria:**
- [ ] `extractLog.ts` uses `findFirstResolvedLink` with `ObsidianLinkResolver` — no raw `MetadataCache`
- [ ] `parseTargetHeading` called once; result reused
- [ ] `findFirstWikiLink` deleted from `wikilinks.ts`
- [ ] All extractLog integration tests pass

**Verify:** `npx vitest run tests/integration/extractLog.plugin.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Run extractLog tests to establish baseline**

```bash
npx vitest run tests/integration/extractLog.plugin.test.ts
```

All should pass. Record count.

- [ ] **Step 2: Migrate `extractLog.ts` to use `ObsidianLinkResolver`**

In `src/commands/extractLog.ts`, locate the call to `findFirstWikiLink` (line ~77):

```typescript
// BEFORE:
import { findFirstWikiLink } from '../utils/wikilinks';
// ...
const wikilink = findFirstWikiLink(parentText, sourcePath, plugin.app.metadataCache);
```

Replace with:

```typescript
// AFTER:
import { findFirstResolvedLink, ObsidianLinkResolver } from '../utils/wikilinks';
// ...
const linkResolver = new ObsidianLinkResolver(plugin.app.metadataCache);
const wikilink = findFirstResolvedLink(parentText, sourcePath, linkResolver);
```

- [ ] **Step 3: Fix double `parseTargetHeading` call**

In `extractLog.ts`, find the two calls to `parseTargetHeading(plugin.settings.logExtractionTargetHeading)` (lines ~118 and ~159). Remove the second call and use the result from the first:

```typescript
// Call once near the top of the function body:
const { heading: targetHeading, level: targetLevel } = parseTargetHeading(plugin.settings.logExtractionTargetHeading);

// Use targetHeading and targetLevel throughout; delete the second destructuring.
```

- [ ] **Step 4: Delete `findFirstWikiLink` from `src/utils/wikilinks.ts`**

Remove the `findFirstWikiLink` function (line 166 and its JSDoc). Verify it is not imported anywhere:

```bash
grep -r "findFirstWikiLink" src/ tests/
```

Expected: no matches.

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/integration/extractLog.plugin.test.ts
```

Same count, all pass.

- [ ] **Step 6: Commit**

```bash
git add src/commands/extractLog.ts src/utils/wikilinks.ts
git commit -m "refactor: route extractLog wikilink resolution through ObsidianLinkResolver; fix double parseTargetHeading"
```

---

### Task 7: Unify child indentation across commands

**Goal:** Replace the three inconsistent indentation strategies with a single `buildTaskContent` helper.

**Audit findings:** 5.2, 4.2

**Files:**
- Modify: `src/utils/tasks.ts`
- Modify: `src/commands/pushTaskDown.ts`
- Modify: `src/commands/pullTaskUp.ts`
- Modify: `src/commands/takeProjectTask.ts`
- Modify: `src/utils/projects.ts`

**Acceptance Criteria:**
- [ ] `buildTaskContent(taskLine: string, children: string[], indent: number): string` exported from `tasks.ts`
- [ ] `pushTaskDown`, `pullTaskUp`, `takeProjectTask` all use `buildTaskContent`
- [ ] `insertUnderCollectorTask` uses the same indentation as the deduplication path in `takeProjectTask`
- [ ] All integration tests pass

**Verify:** `npx vitest run` → all pass

**Steps:**

- [ ] **Step 1: Write a failing test for `buildTaskContent`**

Add to `tests/unit/tasks.test.ts`:

```typescript
describe('buildTaskContent', () => {
    it('returns task line alone when no children', () => {
        expect(buildTaskContent('- [ ] Task', [], 2)).toBe('- [ ] Task');
    });

    it('indents children by given amount', () => {
        const result = buildTaskContent('- [ ] Task', ['Child one', 'Child two'], 2);
        expect(result).toBe('- [ ] Task\n  Child one\n  Child two');
    });

    it('preserves empty child lines without adding indent', () => {
        const result = buildTaskContent('- [ ] Task', ['Child', ''], 2);
        expect(result).toBe('- [ ] Task\n  Child\n');
    });
});
```

Run: `npx vitest run tests/unit/tasks.test.ts` → FAIL (function not exported)

- [ ] **Step 2: Add `buildTaskContent` to `src/utils/tasks.ts`**

```typescript
/**
 * Build a task line with its children, applying consistent indentation.
 *
 * @param taskLine - The task line itself (e.g. "- [ ] Do something")
 * @param children - Child lines (already stripped of leading whitespace)
 * @param indent - Number of spaces to prepend to each non-empty child line
 */
export function buildTaskContent(taskLine: string, children: string[], indent: number): string {
    if (children.length === 0) return taskLine;
    const indentStr = ' '.repeat(indent);
    const childText = children.map(line => line ? indentStr + line : line).join('\n');
    return taskLine + '\n' + childText;
}
```

Run: `npx vitest run tests/unit/tasks.test.ts` → all pass

- [ ] **Step 3: Update `pushTaskDown.ts`**

Locate the inline `'  ' + line` indentation. Replace with:

```typescript
import { buildTaskContent } from '../utils/tasks';
// ...
const content = buildTaskContent(taskLine, childLines, 2);
```

- [ ] **Step 4: Update `pullTaskUp.ts`**

Same pattern as Step 3.

- [ ] **Step 5: Update `takeProjectTask.ts` and `projects.ts`**

In `takeProjectTask.ts`, replace both the `indentLines(..., 4)` path and the `'  ' + line` path with `buildTaskContent(..., 2)`. Use indent 2 for both paths to match the rest of the plugin.

In `projects.ts`, update `insertUnderCollectorTask` to use `buildTaskContent` with indent 2 instead of the hardcoded `collectorIndent + 4`.

> **Design note:** The previous 4-space indent in the collector path was inconsistent with the 2-space indent everywhere else. Both paths now use 2. If testing reveals a case where 4 spaces was intentional (e.g. nested under a collector line that is itself indented), adjust the `indent` argument rather than reverting to the hardcoded offset.

- [ ] **Step 6: Run tests**

```bash
npx vitest run
```

All pass. If any test fails because it expected 4-space indentation, update the test expectation to 2 spaces.

- [ ] **Step 7: Commit**

```bash
git add src/utils/tasks.ts src/commands/pushTaskDown.ts src/commands/pullTaskUp.ts \
    src/commands/takeProjectTask.ts src/utils/projects.ts \
    tests/unit/tasks.test.ts
git commit -m "refactor: unify child indentation across commands with buildTaskContent helper"
```

---

### Task 8: Resolve `PeriodicNoteService` dual API

**Goal:** All commands use the `PeriodicNoteService` class. Remove the legacy string overload and the impossible-null guard.

**Audit findings:** 3.1, 3.3, 3.4

**Files:**
- Modify: `src/utils/periodicNotes.ts`
- Modify: `src/commands/migrateTask.ts`
- Modify: `src/commands/pullTaskUp.ts`

**Acceptance Criteria:**
- [ ] `migrateTask.ts` and `pullTaskUp.ts` use `PeriodicNoteService` instead of standalone imports
- [ ] `normalizeSettings` accepts only `BulletFlowSettings` (string overload removed)
- [ ] Null guard `if (!noteInfo) return ''` in `getNextNotePath` removed
- [ ] All tests pass

**Verify:** `npx vitest run` → all pass; `npm run build` → no errors

**Steps:**

- [ ] **Step 1: Identify standalone function imports in commands**

```bash
grep -rn "from '../utils/periodicNotes'" src/commands/
```

Note which commands import `parseNoteType`, `getHigherNotePath`, or other standalone functions directly instead of using `new PeriodicNoteService(...)`.

- [ ] **Step 2: Update `migrateTask.ts` and `pullTaskUp.ts`**

Replace direct standalone function imports with `PeriodicNoteService`:

```typescript
// BEFORE:
import { parseNoteType, getHigherNotePath } from '../utils/periodicNotes';
// ...
const noteInfo = parseNoteType(file.basename, plugin.settings);
const targetPath = getHigherNotePath(noteInfo, plugin.settings);

// AFTER:
import { PeriodicNoteService } from '../utils/periodicNotes';
// ...
const noteService = new PeriodicNoteService(plugin.settings);
const noteInfo = noteService.parseNoteType(file.basename);
const targetPath = noteService.getHigherNotePath(noteInfo);
```

- [ ] **Step 3: Remove the string overload from `normalizeSettings`**

In `src/utils/periodicNotes.ts`, change the signature of `normalizeSettings` from:

```typescript
function normalizeSettings(settings: string | Partial<BulletFlowSettings>): BulletFlowSettings
```

to:

```typescript
function normalizeSettings(settings: Partial<BulletFlowSettings>): BulletFlowSettings
```

Remove the `if (typeof settings === 'string')` branch. Run `npm run build` to confirm no callers pass a string.

- [ ] **Step 4: Remove the impossible null guard in `getNextNotePath`**

Remove the opening line `if (!noteInfo) return ''` from `getNextNotePath`. The parameter type is `NoteInfo`, not `NoteInfo | null`, so this guard is dead.

- [ ] **Step 5: Run tests**

```bash
npx vitest run
```

All pass.

- [ ] **Step 6: Commit**

```bash
git add src/utils/periodicNotes.ts src/commands/migrateTask.ts src/commands/pullTaskUp.ts
git commit -m "refactor: unify PeriodicNoteService usage; remove string overload and impossible null guard"
```

---

### Task 9: Split `tasks.ts` — extract `taskMarker.ts`

**Goal:** Separate `TaskState` and `TaskMarker` (the state machine) from document-level operations so the dependency graph is clear and each file has a single concern.

**Audit findings:** 2.4, 2.2

**Files:**
- Create: `src/utils/taskMarker.ts`
- Modify: `src/utils/tasks.ts`
- Modify: `src/utils/autoMove.ts`
- Modify: `src/events/autoMoveCompleted.ts`
- Modify: all other files importing `TaskState` or `TaskMarker` from `tasks.ts`

**Acceptance Criteria:**
- [ ] `src/utils/taskMarker.ts` exports `TaskState` and `TaskMarker`
- [ ] `src/utils/tasks.ts` re-exports them for backwards compat (`export { TaskState, TaskMarker } from './taskMarker'`) — this avoids needing to update every import at once
- [ ] `findTopLevelTasksInRange` parameter changed from `any[]` to `ListItem[]`
- [ ] All tests pass; `npm run build` → no errors

**Verify:** `npx vitest run` → all pass

**Steps:**

- [ ] **Step 1: Create `src/utils/taskMarker.ts`**

Move `TaskState` enum and `TaskMarker` class (plus `isIncompleteTask`, `isTerminalTask`, `markTaskAsScheduled`, `markTaskAsOpen` predicates that operate on a single line string) from `tasks.ts` into the new file. Export all of them.

Keep in `tasks.ts`: section utilities, insertion, deduplication, `findTopLevelTasksInRange`, `buildTaskContent`.

At the bottom of `tasks.ts`, add re-exports so existing imports don't break immediately:

```typescript
export { TaskState, TaskMarker } from './taskMarker';
```

- [ ] **Step 2: Fix `any[]` parameter in `findTopLevelTasksInRange`**

In `tasks.ts` (now without the `any[]` type), change:

```typescript
// BEFORE:
function findTopLevelTasksInRange(listItems: any[], startLine: number, endLine: number)

// AFTER:
function findTopLevelTasksInRange(listItems: ListItem[], startLine: number, endLine: number)
```

- [ ] **Step 3: Run build to check for type errors**

```bash
npm run build
```

Fix any type errors surfaced by removing `any[]`.

- [ ] **Step 4: Run tests**

```bash
npx vitest run
```

All pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/taskMarker.ts src/utils/tasks.ts
git commit -m "refactor: extract TaskState and TaskMarker into taskMarker.ts; fix any[] in findTopLevelTasksInRange"
```

---

### Task 10: Fix O(n²) in `findProjectLinkInAncestors`

**Goal:** Build the `lineToItemMap` once before the ancestor walk instead of scanning the full list on each iteration.

**Audit findings:** 1.4

**Files:**
- Modify: `src/utils/projects.ts`
- Modify: `tests/unit/projects.test.ts` (verify no changes needed)

**Acceptance Criteria:**
- [ ] `findProjectLinkInAncestors` builds `buildLineToItemMap(listItems)` once before its while loop
- [ ] Uses map lookup instead of `getListItemAtLine` inside the loop
- [ ] All tests pass

**Verify:** `npx vitest run tests/unit/projects.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Read `findProjectLinkInAncestors` in `projects.ts`**

Identify the while loop that calls `getListItemAtLine(listItems, parentLine)` on each iteration.

- [ ] **Step 2: Replace the scan with a map lookup**

```typescript
// BEFORE (inside findProjectLinkInAncestors):
while (parentLine >= 0) {
    const parent = getListItemAtLine(listItems, parentLine);
    // ...
}

// AFTER:
const lineMap = buildLineToItemMap(listItems);
while (parentLine >= 0) {
    const parent = lineMap.get(parentLine) ?? null;
    // ...
}
```

Import `buildLineToItemMap` from `listItems.ts` if not already imported.

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/unit/projects.test.ts
```

All pass.

- [ ] **Step 4: Commit**

```bash
git add src/utils/projects.ts
git commit -m "perf: replace O(n) scan with map lookup in findProjectLinkInAncestors"
```

---

## P2 — Documentation

### Task 11: Document `TaskMarker` extensibility constraint

**Goal:** Record the "update four locations together" rule in `key-insights.md` so future contributors adding new task types know what to touch.

**Audit findings:** 2.1, 9.2

**Files:**
- Modify: `docs/key-insights.md`

**Acceptance Criteria:**
- [ ] `key-insights.md` has a `TaskMarker Extensibility` section explaining `fromLine`, `isIncomplete`, `isTerminal`, `canMigrate`, `canReopen` must all be updated together

**Steps:**

- [ ] **Step 1: Add section to `docs/key-insights.md`**

Add after the existing `List Item Hierarchy` section:

```markdown
## TaskMarker Extensibility

`TaskState` and `TaskMarker` in `src/utils/taskMarker.ts` use a closed switch over known
task characters. When adding a new task type (e.g. `[e]` for event, `[m]` for mood),
update **all five locations together** — missing one silently misfires:

1. `TaskState` enum — add the new state value
2. `TaskMarker.fromLine()` — add the character in the switch
3. `TaskMarker.isIncomplete()` — decide if the new state is "incomplete" (can be migrated/scheduled)
4. `TaskMarker.isTerminal()` — decide if the new state is terminal (no further transitions)
5. `canMigrate()` / `canReopen()` — if the new state participates in those transitions

Tests to add: a `fromLine` round-trip test, plus predicate tests for each of the above.
```

- [ ] **Step 2: Commit**

```bash
git add docs/key-insights.md
git commit -m "docs: document TaskMarker extensibility constraint in key-insights.md"
```

---

### Task 12: Fix `CLAUDE.md` state diagram

**Goal:** Show `[/]` (Started) as a proper node and include its direct paths to `[>]` and `[<]`.

**Audit findings:** 9.1

**Files:**
- Modify: `CLAUDE.md`

**Acceptance Criteria:**
- [ ] `[/]` appears as a distinct entry state alongside `[ ]`
- [ ] Diagram shows `[/]` → `[>]` (migrateTask) and `[/]` → `[<]` (pushDown/pullUp) transitions

**Steps:**

- [ ] **Step 1: Update the state machine diagram in `CLAUDE.md`**

Replace the current diagram block:

```
**Task state machine:**
```
[ ] (Open)   ─┬─ migrateTask ─→ [>] (Migrated) [terminal]
[/] (Started) │
              ├─ pushDown/pullUp ─→ [<] (Scheduled) ─→ merge ─→ [ ] (Open)
              └─ complete ─→ [x] (Completed) [terminal]
```
```

With the corrected version:

```
**Task state machine:**
```
[ ] (Open)    ─┬─ migrateTask  ──→ [>] (Migrated)  [terminal]
[/] (Started) ─┤
               ├─ pushDown/pullUp → [<] (Scheduled) ─→ merge ─→ [ ] (Open)
               └─ complete ──────→ [x] (Completed)  [terminal]
```
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: fix task state diagram — show Started as distinct entry state with its transitions"
```

---

### Task 13: Final verification and CHANGELOG

**Goal:** Confirm all tests pass, the build is clean, and the CHANGELOG is ready for release.

**Files:**
- Modify: `CHANGELOG.md`

**Acceptance Criteria:**
- [ ] `npx vitest run` → all pass
- [ ] `npm run build` → no errors or warnings
- [ ] CHANGELOG has entries for all user-facing changes from this audit

**Steps:**

- [ ] **Step 1: Full test run**

```bash
npx vitest run
```

All pass.

- [ ] **Step 2: Build**

```bash
npm run build
```

No errors.

- [ ] **Step 3: Review CHANGELOG**

The `## Unreleased` section should contain at minimum:

- Fixed: Auto-move hang when completing tasks in complex notes
- Changed: Migrate, Push Down, Pull Up, and Take Project Task now insert under `## Todo` by default (was `## Log`)
- Fixed: Finish Project no longer modifies file content if the archive folder cannot be created

Add any entries that are missing.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: finalize CHANGELOG entries for codebase audit"
```
