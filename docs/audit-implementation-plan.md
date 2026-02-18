# Audit Implementation Plan

Findings from the CLAUDE.md audit, ordered by priority. Finding 4 of the original audit
(CHANGELOG v0.5.1 wording) is out of scope and omitted here.

---

## Finding 1 — Raw task marker manipulation (High)

**Rule:** *"Never manipulate task markers as raw strings — use `TaskMarker`."*

### Files and lines

| File | Lines | Pattern used directly |
|---|---|---|
| `src/commands/migrateTask.ts` | 74, 83 | `STARTED_TO_OPEN_PATTERN`, `MIGRATE_TASK_PATTERN` |
| `src/commands/pushTaskDown.ts` | 109 | `STARTED_TO_OPEN_PATTERN` |
| `src/commands/takeProjectTask.ts` | 88, 91–94 | `STARTED_TO_OPEN_PATTERN`, ad hoc `/^(- \[.\]\s*)/` |
| `src/commands/dropTaskToProject.ts` | 184–185 | Ad hoc `RegExp` built from `(- \\[.\\]\\s*)` |

### Implementation steps

1. **Extend `TaskMarker`** (`src/utils/tasks.ts`) with two missing operations:
   - `toOpen(): TaskMarker` — already exists; verify it covers the `[/] → [ ]` case used
     by `STARTED_TO_OPEN_PATTERN` (started → open on copy to target).
   - `stripProjectLink(line: string, projectName: string): string` — pure static helper that
     removes a `[[ProjectName]] ` prefix from a task line, replacing the raw regex in
     `dropTaskToProject.ts` and `takeProjectTask.ts`.

2. **Update `migrateTask.ts`**:
   - Replace `lineText.replace(MIGRATE_TASK_PATTERN, '$1' + MIGRATED_MARKER)` with
     `TaskMarker.fromLine(lineText).toMigrated().applyToLine(lineText)`.
   - Replace `parentLineStripped.replace(STARTED_TO_OPEN_PATTERN, …)` with
     `TaskMarker.fromLine(parentLineStripped).toOpen().applyToLine(parentLineStripped)`.

3. **Update `pushTaskDown.ts`** and **`pullTaskUp.ts`**:
   - Same `STARTED_TO_OPEN_PATTERN` replacement as above.

4. **Update `takeProjectTask.ts`**:
   - Same `STARTED_TO_OPEN_PATTERN` replacement.
   - Replace the ad hoc `/^(- \[.\]\s*)/` regex with a call to the new
     `TaskMarker.prependToContent(line, text)` helper (or equivalent clean API).

5. **Update `dropTaskToProject.ts`**:
   - Replace the ad hoc `RegExp` + `.replace` with `TaskMarker.stripProjectLink(line, projectName)`.

6. **Tests:** Update or add unit tests in `tests/unit/tasks.test.ts` to cover any new or
   extended `TaskMarker` methods before touching the commands.

---

## Finding 2 — Shared types outside `src/types.ts` (High)

**Rule:** *"All shared types live in `src/types.ts`. Import with
`import type { TypeName } from '../types'`."*

### Types to move

| Type | Current location | Imported by |
|---|---|---|
| `TaskInsertItem` | `src/utils/tasks.ts:533` | `pushTaskDown.ts`, `pullTaskUp.ts`, `takeProjectTask.ts`, `dropTaskToProject.ts` |
| `InsertTaskResult` | `src/utils/tasks.ts:470` | Internal to `tasks.ts` only — still move for consistency |
| `ActiveMarkdownContext` | `src/utils/commandSetup.ts:9` | Internal to `commandSetup.ts` only — still move for consistency |

### Implementation steps

1. **Move `TaskInsertItem` and `InsertTaskResult`** from `src/utils/tasks.ts` to
   `src/types.ts` under a new `// === Task Insertion ===` section.

2. **Move `ActiveMarkdownContext`** from `src/utils/commandSetup.ts` to `src/types.ts`
   under a `// === Commands ===` section.
   - Note: `ActiveMarkdownContext` contains `file: TFile`. Since the adapter pattern
     (`ObsidianLinkResolver`) already lives in `utils/wikilinks.ts`, and `commandSetup.ts`
     is explicitly infrastructure, the `TFile` reference here is at the boundary. Moving it
     to `types.ts` will introduce `TFile` into the domain type file — evaluate whether a
     plain `{ path: string; basename: string }` shape would serve instead, so `types.ts`
     stays Obsidian-free (see also Finding 6 below).

3. **Update all import sites** to use `import type { … } from '../types'` (commands) or
   `import type { … } from '../../types'` (from inside utils/).

4. **Remove the re-exports / now-unused imports** from `tasks.ts` and `commandSetup.ts`.

5. **Run `npm test`** to verify nothing broke.

---

## Finding 3 — Planning terms in test describe blocks (Medium)

**Rule:** *"NEVER add planning comments to committed code. MVP, Slice references belong in
GitHub issues — not in source files."*

### File: `tests/integration/migrateTask.plugin.test.ts`

| Line | Current | Replace with |
|---|---|---|
| 4 | `'migrateTask (plugin) - MVP integration'` | `'migrateTask (plugin)'` |
| 73 | `'single line migration - daily notes only (MVP)'` | `'single line migration - daily notes only'` |
| 215 | `'boundary transitions (Slice 6)'` | `'boundary transitions'` |
| 249 | `'multi-select migration (Slice 6)'` | `'multi-select migration'` |

### Implementation steps

1. Rename the four `describe(…)` labels as shown above.
2. Run `npm test` to confirm the test file is still valid.

---

## Finding 4 — `console.log` in error paths (Medium)

**Rule:** CLAUDE.md's command template uses `console.error('newCommand error:', e)`.

### Affected lines

| File | Line | Current |
|---|---|---|
| `src/commands/extractLog.ts` | 206 | `console.log('extractLog ERROR', e)` |
| `src/commands/extractLog.ts` | 26 | `console.log('copyToClipboard error:', e)` |
| `src/commands/migrateTask.ts` | 112 | `console.log('migrateTask ERROR', e)` |
| `src/commands/pushTaskDown.ts` | 172 | `console.log('pushTaskDown ERROR', e)` |
| `src/commands/pullTaskUp.ts` | 155 | `console.log('pullTaskUp ERROR', e)` |
| `src/commands/takeProjectTask.ts` | 187 | `console.log('takeProjectTask ERROR', e)` |
| `src/commands/dropTaskToProject.ts` | 175 | `console.log('dropTaskToProject ERROR', e)` |

### Implementation steps

1. Replace every `console.log(…ERROR…)` in the catch blocks above with `console.error(…)`.
2. No logic change, no test update needed.

---

## Finding 5 — Stale CLAUDE.md structure diagram (Low)

**Rule:** The structure section of CLAUDE.md must reflect the actual layout. Currently missing:
`src/settings.ts`, `src/ui/HotkeyModal.ts`, `tests/legacy/`.

### Recommended approach: lint hook

Rather than only fixing the diagram once, add a **pre-commit hook** (`.githooks/pre-commit`
or a Vitest lint step) that fails if the file tree under `src/` diverges from what CLAUDE.md
declares.

**Proposed hook script** (`.githooks/check-claude-structure`):

```bash
#!/usr/bin/env bash
# Verify that every directory listed in CLAUDE.md's structure block exists,
# and that every top-level src/ entry is listed there.
set -euo pipefail

CLAUDE=CLAUDE.md
ERRORS=0

# Extract indented path tokens from the code fence in CLAUDE.md
declared=$(grep -E '^\s+├──|^\s+└──|^\s+│' "$CLAUDE" \
  | sed 's/.*[├└]── //' \
  | sed 's/#.*//' \
  | awk '{print $1}' \
  | grep -v '^$')

# Check that every declared src/ entry exists on disk
for token in $declared; do
  path="src/$token"
  if [[ "$token" != *"/"* ]] && [[ "$token" == *.ts ]]; then
    [[ -f "src/$token" ]] || { echo "CLAUDE.md lists src/$token but file not found"; ERRORS=$((ERRORS+1)); }
  fi
done

# Check that every real top-level src/ file is declared
for f in src/*.ts; do
  base=$(basename "$f")
  grep -q "$base" "$CLAUDE" || { echo "src/$base exists but is not listed in CLAUDE.md"; ERRORS=$((ERRORS+1)); }
done

exit $ERRORS
```

The hook is already wired via `postinstall` (`git config core.hooksPath .githooks`), so a
new script placed there runs automatically for all contributors.

### Implementation steps

1. **Fix the diagram now:** Add `src/settings.ts`, `src/ui/` (with `HotkeyModal.ts`), and
   `tests/legacy/` to the structure block in `CLAUDE.md`.
2. **Write the hook script** at `.githooks/check-claude-md-structure` and make it executable.
3. **Invoke it from the existing pre-commit hook** (or create one if absent), so it runs on
   every commit.
4. **Document it** in CLAUDE.md under a "Hooks" or "Development" sub-section so contributors
   know it exists and what to do when it fails.

---

## Finding 6 — Deprecated `WikiLink` type leaks `TFile` into `src/types.ts` (Low)

**Rule:** *"Expose Obsidian types only at the boundary."*

`src/types.ts` imports `TFile` solely to support the `@deprecated WikiLink` interface.
The migration path is clear but not tracked.

### Implementation steps

1. **Audit callers of `WikiLink`** — run `grep -rn 'WikiLink' src/` to identify any
   remaining references. If none remain beyond the declaration, delete `WikiLink` and the
   `TFile` import in the same PR as Finding 2.
2. **If callers remain,** open a GitHub issue (e.g. "Remove deprecated WikiLink type") and
   add a comment in `types.ts` pointing to it:
   ```typescript
   // TODO(#<issue>): Delete WikiLink and the TFile import once all callers are removed.
   ```
   This makes the debt visible without leaving a stray planning comment without a reference.

---

## Suggested work order

1. Finding 3 — trivial rename, unblocks clean test run
2. Finding 4 — mechanical find-replace, no risk
3. Finding 2 — move types; run tests to confirm
4. Finding 1 — most complex; extend `TaskMarker` first, then update commands one by one
5. Finding 6 — check callers, delete or track
6. Finding 5 — fix diagram, write and wire hook
