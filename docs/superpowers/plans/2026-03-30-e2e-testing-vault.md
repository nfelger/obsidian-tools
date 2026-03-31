# E2E Testing with wdio-obsidian-service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a WebdriverIO + wdio-obsidian-service smoke test layer that runs all seven Bullet Flow commands against a real Obsidian instance and asserts on vault file contents.

**Architecture:** Seven spec files (one per command) run against a live Obsidian instance launched by wdio-obsidian-service. Each spec creates its own working files in `beforeAll`, invokes commands via JS injection, and asserts by reading files off disk via Node.js `fs`. Vault files are created with date-aware paths so tests always use today's actual dates.

**Tech Stack:** wdio-obsidian-service, WebdriverIO 9, Mocha, TypeScript, ts-node, Node.js fs, moment.js

**User Verification:** NO

---

## Reference

- [wdio-obsidian-service](https://github.com/jesse-r-s-hines/wdio-obsidian-service)
- [Sample plugin](https://github.com/jesse-r-s-hines/wdio-obsidian-service-sample-plugin) — consult this for exact config API and `.obsidian/` fixture layout when anything below is unclear.

## Key Constants

- Plugin ID: `bullet-flow` (from `manifest.json`)
- Diary folder: `+Diary` (DEFAULT_SETTINGS)
- Daily path pattern: `YYYY/MM/YYYY-MM-DD ddd` → e.g. `+Diary/2026/03/2026-03-30 Mon.md`
- Weekly path pattern: `gggg/MM/gggg-MM-[W]WW` → e.g. `+Diary/2026/03/2026-03-W14.md`
- Projects folder: `1 Projekte`
- Archive folder: `4 Archive`
- Periodic note target heading: `## Log`
- Project note target heading: `## Todo`

## File Map

```
tests/e2e/
├── wdio.conf.ts                          # WebdriverIO config (created, Task 1)
├── tsconfig.json                         # e2e-specific TS config (created, Task 1)
├── fixtures/
│   └── vault/
│       └── .obsidian/
│           ├── app.json                  # Suppress first-run prompts (Task 1)
│           └── community-plugins.json    # Enable bullet-flow (Task 1)
├── helpers/
│   ├── paths.ts                          # VAULT_DIR + date-aware path helpers (Task 2)
│   └── vault.ts                          # createVaultFile, readVaultFile, runCommand, openFileAtLine (Task 2)
└── specs/
    ├── smoke.e2e.ts                      # Plugin-loaded sanity check (Task 1)
    ├── extractLog.e2e.ts                 # (Task 3)
    ├── migrateTask.e2e.ts                # (Task 3)
    ├── pushTaskDown.e2e.ts               # (Task 4)
    ├── pullTaskUp.e2e.ts                 # (Task 4)
    ├── takeProjectTask.e2e.ts            # (Task 5)
    ├── dropTaskToProject.e2e.ts          # (Task 5)
    └── finishProject.e2e.ts              # (Task 5)

package.json                              # add test:e2e script (Task 1)
.github/workflows/e2e.yml                 # CI workflow (Task 6)
```

---

### Task 1: Install dependencies, scaffold, configure wdio.conf.ts

**Goal:** A working wdio-obsidian-service setup that launches Obsidian headlessly with the bullet-flow plugin installed, verified by a passing smoke spec.

**Files:**
- Create: `tests/e2e/wdio.conf.ts`
- Create: `tests/e2e/tsconfig.json`
- Create: `tests/e2e/fixtures/vault/.obsidian/app.json`
- Create: `tests/e2e/fixtures/vault/.obsidian/community-plugins.json`
- Create: `tests/e2e/specs/smoke.e2e.ts`
- Modify: `package.json`

**Acceptance Criteria:**
- [ ] `npm run build && npm run test:e2e` launches Obsidian and the smoke spec passes
- [ ] Smoke spec confirms `app.plugins.plugins['bullet-flow']` is truthy
- [ ] Xvfb starts automatically (`autoXvfb: true`) — no DISPLAY error on Linux

**Verify:** `npm run build && npm run test:e2e` → `1 passing` in the spec reporter output

**Steps:**

- [ ] **Step 1: Install dependencies**

```bash
npm install --save-dev wdio-obsidian-service @wdio/cli @wdio/local-runner @wdio/mocha-framework @wdio/spec-reporter ts-node @types/mocha
```

If peer-dependency conflicts arise, consult the sample plugin's `package.json` for compatible versions.

- [ ] **Step 2: Add test:e2e script**

In `package.json`, add to `"scripts"`:

```json
"test:e2e": "wdio run tests/e2e/wdio.conf.ts"
```

- [ ] **Step 3: Create tests/e2e/tsconfig.json**

The root `tsconfig.json` targets ESNext/browser and excludes `tests/`. The e2e runner needs CommonJS + Node types.

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "target": "ES2020",
    "lib": ["ES2020"],
    "types": ["node", "mocha"],
    "esModuleInterop": true,
    "outDir": "../../dist/e2e"
  },
  "include": ["./**/*.ts"]
}
```

- [ ] **Step 4: Create fixture vault .obsidian config**

Create `tests/e2e/fixtures/vault/.obsidian/app.json`:
```json
{}
```

Create `tests/e2e/fixtures/vault/.obsidian/community-plugins.json`:
```json
["bullet-flow"]
```

The `bullet-flow` plugin files (`main.js`, `manifest.json`, `styles.css`) are installed into the vault by wdio-obsidian-service via the `plugins: ['.']` config — you do **not** pre-populate them here.

- [ ] **Step 5: Create tests/e2e/wdio.conf.ts**

```typescript
import os from 'os';
import path from 'path';
import fs from 'fs';
import type { Options } from '@wdio/types';

export const VAULT_DIR = path.join(os.tmpdir(), 'bullet-flow-e2e-vault');
const FIXTURE_VAULT_DIR = path.join(__dirname, 'fixtures/vault');

export const config: Options.Testrunner = {
  runner: 'local',
  specs: ['./tests/e2e/specs/**/*.e2e.ts'],
  maxInstances: 1,
  capabilities: [{}],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      project: 'tests/e2e/tsconfig.json',
      transpileOnly: true,
    },
  },
  services: [
    ['obsidian', {
      obsidianVersion: 'latest',
      plugins: ['.'],
      vault: VAULT_DIR,
      autoXvfb: true,
    }],
  ],
  async onPrepare() {
    if (fs.existsSync(VAULT_DIR)) {
      fs.rmSync(VAULT_DIR, { recursive: true });
    }
    fs.cpSync(FIXTURE_VAULT_DIR, VAULT_DIR, { recursive: true });
  },
};
```

Note: If `autoCompileOpts` is not supported by this wdio version, use `ts-node/register` in a `.mocharc.js` or check the sample plugin's wdio config.

- [ ] **Step 6: Create tests/e2e/specs/smoke.e2e.ts**

```typescript
describe('smoke', () => {
  it('loads bullet-flow plugin in Obsidian', async () => {
    const hasPlugin = await browser.execute(() => {
      return !!(window as any).app?.plugins?.plugins?.['bullet-flow'];
    });
    expect(hasPlugin).toBe(true);
  });
});
```

- [ ] **Step 7: Build and run**

```bash
npm run build && npm run test:e2e
```

Expected output includes:
```
smoke
  ✓ loads bullet-flow plugin in Obsidian

1 passing
```

If Obsidian fails to start: check that `main.js` exists at the repo root after build. If plugin is not found: verify `.obsidian/community-plugins.json` and check how wdio-obsidian-service installs plugins in the sample plugin repo.

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/ package.json package-lock.json
git commit -m "feat(e2e): scaffold wdio-obsidian-service with smoke test"
```

---

### Task 2: Implement vault helpers

**Goal:** A `paths.ts` module with date-aware path helpers and a `vault.ts` module with file manipulation, command invocation, and file-open helpers used by all specs.

**Files:**
- Create: `tests/e2e/helpers/paths.ts`
- Create: `tests/e2e/helpers/vault.ts`

**Acceptance Criteria:**
- [ ] `todayDailyPath()` returns the correct vault-relative path for today's date
- [ ] `tomorrowDailyPath()` returns tomorrow's path
- [ ] `thisWeeklyPath()` returns the ISO-week path for the current week
- [ ] `createVaultFile` creates a file (and parent dirs) in VAULT_DIR
- [ ] `readVaultFile` reads a file from VAULT_DIR
- [ ] `runCommand` executes a bullet-flow command in the live Obsidian instance
- [ ] `openFileAtLine` opens a vault file and positions the cursor

**Verify:** These are verified in practice by Task 3–5 smoke tests passing. No separate test needed.

**Steps:**

- [ ] **Step 1: Create tests/e2e/helpers/paths.ts**

Uses moment.js (already in devDependencies) to compute dated paths using the same format strings as `DEFAULT_SETTINGS`.

```typescript
import os from 'os';
import path from 'path';
import moment from 'moment';

export const VAULT_DIR = path.join(os.tmpdir(), 'bullet-flow-e2e-vault');

// Vault-relative paths — match DEFAULT_SETTINGS patterns exactly

export function todayDailyPath(): string {
  return `+Diary/${moment().format('YYYY/MM/YYYY-MM-DD ddd')}.md`;
}

export function tomorrowDailyPath(): string {
  return `+Diary/${moment().add(1, 'day').format('YYYY/MM/YYYY-MM-DD ddd')}.md`;
}

export function thisWeeklyPath(): string {
  return `+Diary/${moment().format('gggg/MM/gggg-MM-[W]WW')}.md`;
}

export const PROJECT_NOTE_PATH = '1 Projekte/My Project.md';
export const AREA_NOTE_PATH = 'Areas/My Area.md';
export const ARCHIVE_DIR = '4 Archive';
```

- [ ] **Step 2: Create tests/e2e/helpers/vault.ts**

```typescript
import fs from 'fs';
import path from 'path';
import { VAULT_DIR } from './paths';

/** Write (or overwrite) a file in the live vault. Creates parent directories. */
export function createVaultFile(relPath: string, content: string): void {
  const fullPath = path.join(VAULT_DIR, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

/** Read a file from the live vault. */
export function readVaultFile(relPath: string): string {
  return fs.readFileSync(path.join(VAULT_DIR, relPath), 'utf8');
}

/** Check whether a path exists in the live vault. */
export function vaultPathExists(relPath: string): boolean {
  return fs.existsSync(path.join(VAULT_DIR, relPath));
}

/**
 * Open a vault file in Obsidian and position the cursor at `line` (0-indexed).
 * Waits for the editor to be ready before returning.
 */
export async function openFileAtLine(relPath: string, line: number): Promise<void> {
  await browser.execute(async (filePath: string, lineNum: number) => {
    const app = (window as any).app;
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file) throw new Error(`openFileAtLine: file not found: ${filePath}`);
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(file);
    const editor = app.workspace.activeEditor?.editor;
    if (editor) {
      editor.setCursor({ line: lineNum, ch: 0 });
    }
  }, relPath, line);
  // Allow Obsidian to finish rendering the editor
  await browser.pause(500);
}

/**
 * Execute a bullet-flow command by its short ID (without the 'bullet-flow:' prefix).
 * Waits for async command to settle before returning.
 */
export async function runCommand(commandId: string): Promise<void> {
  await browser.execute((id: string) => {
    (window as any).app.commands.executeCommandById(`bullet-flow:${id}`);
  }, commandId);
  await browser.pause(500);
}
```

Note: `leaf.openFile` is the correct Obsidian 1.x API. If the types complain, use `as any`. The exact `workspace.activeEditor` property name should be verified against the Obsidian API — fall back to `workspace.activeLeaf?.view?.editor` if needed.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/helpers/
git commit -m "feat(e2e): add vault path helpers and wdio interaction utilities"
```

---

### Task 3: Smoke tests — extractLog and migrateTask

**Goal:** Two passing E2E specs that verify `extractLog` moves child bullets to a linked note and `migrateTask` copies a task to the next daily note and marks the source.

**Files:**
- Create: `tests/e2e/specs/extractLog.e2e.ts`
- Create: `tests/e2e/specs/migrateTask.e2e.ts`

**Acceptance Criteria:**
- [ ] extractLog spec passes: child content appears in area note, source wikilink gains section anchor
- [ ] migrateTask spec passes: task copied to tomorrow's daily, source marked `[>]`

**Verify:** `npm run test:e2e` → `3 passing` (smoke + 2 new specs)

**Steps:**

- [ ] **Step 1: Write extractLog.e2e.ts**

```typescript
import {
  createVaultFile, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, AREA_NOTE_PATH } from '../helpers/paths';

describe('extractLog', () => {
  beforeAll(async () => {
    // Source: daily note with a wikilink bullet that has children
    createVaultFile(todayDailyPath(), [
      '## Log',
      '',
      '- [[My Area]] notes from today',
      '  - Child item 1',
      '  - Child item 2',
    ].join('\n'));

    // Target: area note with a ## Log heading
    createVaultFile(AREA_NOTE_PATH, [
      '# My Area',
      '',
      '## Log',
    ].join('\n'));
  });

  it('moves children to the linked note and updates the wikilink', async () => {
    // Open daily note, cursor on the wikilink line (line 2, 0-indexed)
    await openFileAtLine(todayDailyPath(), 2);
    await runCommand('extract-log');

    // Source: children removed, wikilink updated to include section anchor
    const daily = readVaultFile(todayDailyPath());
    expect(daily).not.toContain('Child item 1');
    expect(daily).toContain('[[My Area#');   // section anchor added
    expect(daily).toContain('|My Area]]');   // display text preserved

    // Target: children appear under ## Log
    const area = readVaultFile(AREA_NOTE_PATH);
    expect(area).toContain('Child item 1');
    expect(area).toContain('Child item 2');
    expect(area).toContain('## Log');
  });
});
```

- [ ] **Step 2: Write migrateTask.e2e.ts**

```typescript
import {
  createVaultFile, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, tomorrowDailyPath } from '../helpers/paths';

describe('migrateTask', () => {
  beforeAll(async () => {
    // Source: today's daily note with an open task
    createVaultFile(todayDailyPath(), [
      '## Log',
      '',
      '- [ ] Task to migrate',
    ].join('\n'));

    // Target: tomorrow's daily note (must exist for migrateTask to succeed)
    createVaultFile(tomorrowDailyPath(), [
      '## Log',
    ].join('\n'));
  });

  it('copies task to next daily note and marks source as migrated', async () => {
    // Open today's daily, cursor on the task (line 2, 0-indexed)
    await openFileAtLine(todayDailyPath(), 2);
    await runCommand('migrate-task');

    // Source: task marked [>]
    const today = readVaultFile(todayDailyPath());
    expect(today).toContain('- [>] Task to migrate');

    // Target: task copied as [ ]
    const tomorrow = readVaultFile(tomorrowDailyPath());
    expect(tomorrow).toContain('- [ ] Task to migrate');
  });
});
```

- [ ] **Step 3: Run and verify**

```bash
npm run build && npm run test:e2e
```

Expected: `3 passing`

Common failure mode: cursor positioning timing. If the command fires before the editor is ready, increase the `browser.pause` in `openFileAtLine`. Also confirm that Obsidian's metadataCache has indexed the file — if not, increase the pause or add a `browser.waitUntil` loop.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/specs/extractLog.e2e.ts tests/e2e/specs/migrateTask.e2e.ts
git commit -m "feat(e2e): add extractLog and migrateTask smoke tests"
```

---

### Task 4: Smoke tests — pushTaskDown and pullTaskUp

**Goal:** Two passing E2E specs: `pushTaskDown` from a weekly note to today's daily, and `pullTaskUp` from today's daily to this week's weekly.

**Files:**
- Create: `tests/e2e/specs/pushTaskDown.e2e.ts`
- Create: `tests/e2e/specs/pullTaskUp.e2e.ts`

**Acceptance Criteria:**
- [ ] pushTaskDown spec passes: task in daily note, weekly note task marked `[<]`
- [ ] pullTaskUp spec passes: task in weekly note, daily note task marked `[<]`

**Verify:** `npm run test:e2e` → `5 passing`

**Steps:**

- [ ] **Step 1: Write pushTaskDown.e2e.ts**

pushTaskDown runs from a **higher-level** periodic note. Source is the weekly note; target is today's daily.

```typescript
import {
  createVaultFile, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, thisWeeklyPath } from '../helpers/paths';

describe('pushTaskDown', () => {
  beforeAll(async () => {
    // Source: this week's weekly note with an open task
    createVaultFile(thisWeeklyPath(), [
      '## Log',
      '',
      '- [ ] Weekly task to push down',
    ].join('\n'));

    // Target: today's daily note must exist
    createVaultFile(todayDailyPath(), [
      '## Log',
    ].join('\n'));
  });

  it('copies task to today\'s daily note and marks weekly note as scheduled', async () => {
    // Open weekly note, cursor on the task (line 2, 0-indexed)
    await openFileAtLine(thisWeeklyPath(), 2);
    await runCommand('push-task-down');

    // Source: task marked [<]
    const weekly = readVaultFile(thisWeeklyPath());
    expect(weekly).toContain('- [<] Weekly task to push down');

    // Target: task appears as [ ]
    const daily = readVaultFile(todayDailyPath());
    expect(daily).toContain('- [ ] Weekly task to push down');
  });
});
```

- [ ] **Step 2: Write pullTaskUp.e2e.ts**

pullTaskUp runs from **today's daily note** and pushes the task up to this week's weekly note.

```typescript
import {
  createVaultFile, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, thisWeeklyPath } from '../helpers/paths';

describe('pullTaskUp', () => {
  beforeAll(async () => {
    // Source: today's daily note with an open task
    createVaultFile(todayDailyPath(), [
      '## Log',
      '',
      '- [ ] Daily task to pull up',
    ].join('\n'));

    // Target: this week's weekly note must exist
    createVaultFile(thisWeeklyPath(), [
      '## Log',
    ].join('\n'));
  });

  it('copies task to weekly note and marks daily note as scheduled', async () => {
    // Open today's daily, cursor on the task (line 2, 0-indexed)
    await openFileAtLine(todayDailyPath(), 2);
    await runCommand('pull-task-up');

    // Source: task marked [<]
    const daily = readVaultFile(todayDailyPath());
    expect(daily).toContain('- [<] Daily task to pull up');

    // Target: task appears as [ ]
    const weekly = readVaultFile(thisWeeklyPath());
    expect(weekly).toContain('- [ ] Daily task to pull up');
  });
});
```

- [ ] **Step 3: Run and verify**

```bash
npm run build && npm run test:e2e
```

Expected: `5 passing`

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/specs/pushTaskDown.e2e.ts tests/e2e/specs/pullTaskUp.e2e.ts
git commit -m "feat(e2e): add pushTaskDown and pullTaskUp smoke tests"
```

---

### Task 5: Smoke tests — takeProjectTask, dropTaskToProject, finishProject

**Goal:** Three passing E2E specs covering project-note commands.

**Files:**
- Create: `tests/e2e/specs/takeProjectTask.e2e.ts`
- Create: `tests/e2e/specs/dropTaskToProject.e2e.ts`
- Create: `tests/e2e/specs/finishProject.e2e.ts`

**Acceptance Criteria:**
- [ ] takeProjectTask: task appears in daily note with `[[My Project]]` prefix; project task marked `[<]`
- [ ] dropTaskToProject: task added to project note's `## Todo`; task line deleted from daily note
- [ ] finishProject: file renamed to `4 Archive/✅ My Project.md`; `completed:` in frontmatter

**Verify:** `npm run test:e2e` → `8 passing`

**Steps:**

- [ ] **Step 1: Write takeProjectTask.e2e.ts**

takeProjectTask runs from the **project note**. The active file must be `1 Projekte/My Project.md`.

```typescript
import {
  createVaultFile, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, PROJECT_NOTE_PATH } from '../helpers/paths';

describe('takeProjectTask', () => {
  beforeAll(async () => {
    // Source: project note with an open task under ## Todo
    createVaultFile(PROJECT_NOTE_PATH, [
      '# My Project',
      '',
      '## Todo',
      '',
      '- [ ] Project task to take',
    ].join('\n'));

    // Target: today's daily note must exist
    createVaultFile(todayDailyPath(), [
      '## Log',
    ].join('\n'));
  });

  it('copies task to daily note with project link and marks source as scheduled', async () => {
    // Open project note, cursor on the task (line 4, 0-indexed)
    await openFileAtLine(PROJECT_NOTE_PATH, 4);
    await runCommand('take-project-task');

    // Source: task marked [<]
    const project = readVaultFile(PROJECT_NOTE_PATH);
    expect(project).toContain('- [<] Project task to take');

    // Target: task appears with [[My Project]] prefix
    const daily = readVaultFile(todayDailyPath());
    expect(daily).toContain('[[My Project]]');
    expect(daily).toContain('Project task to take');
  });
});
```

- [ ] **Step 2: Write dropTaskToProject.e2e.ts**

dropTaskToProject runs from the **daily note**. The task line must contain a `[[My Project]]` wikilink so the plugin knows which project to drop to.

```typescript
import {
  createVaultFile, readVaultFile, openFileAtLine, runCommand
} from '../helpers/vault';
import { todayDailyPath, PROJECT_NOTE_PATH } from '../helpers/paths';

describe('dropTaskToProject', () => {
  beforeAll(async () => {
    // Source: today's daily note with a task that has a [[My Project]] link
    createVaultFile(todayDailyPath(), [
      '## Log',
      '',
      '- [ ] [[My Project]] Task to drop',
    ].join('\n'));

    // Target: project note with ## Todo section
    createVaultFile(PROJECT_NOTE_PATH, [
      '# My Project',
      '',
      '## Todo',
    ].join('\n'));
  });

  it('adds task to project note and removes it from the daily note', async () => {
    // Open daily note, cursor on the task (line 2, 0-indexed)
    await openFileAtLine(todayDailyPath(), 2);
    await runCommand('drop-task-to-project');

    // Source: task line deleted
    const daily = readVaultFile(todayDailyPath());
    expect(daily).not.toContain('Task to drop');

    // Target: task added under ## Todo (without the [[My Project]] prefix)
    const project = readVaultFile(PROJECT_NOTE_PATH);
    expect(project).toContain('Task to drop');
    expect(project).toContain('## Todo');
  });
});
```

- [ ] **Step 3: Write finishProject.e2e.ts**

finishProject runs from the **project note**. It renames the file to `4 Archive/✅ My Project.md` and adds `completed:` to frontmatter.

```typescript
import {
  createVaultFile, readVaultFile, vaultPathExists, openFileAtLine, runCommand
} from '../helpers/vault';
import { PROJECT_NOTE_PATH } from '../helpers/paths';

describe('finishProject', () => {
  beforeAll(async () => {
    // Project note with YAML frontmatter
    createVaultFile(PROJECT_NOTE_PATH, [
      '---',
      'status: active',
      '---',
      '',
      '# My Project',
      '',
      '## Todo',
    ].join('\n'));
  });

  it('moves project to archive with completed date in frontmatter', async () => {
    // Open project note (cursor position doesn't matter for this command)
    await openFileAtLine(PROJECT_NOTE_PATH, 0);
    await runCommand('finish-project');

    // Original path no longer exists
    expect(vaultPathExists(PROJECT_NOTE_PATH)).toBe(false);

    // Archived at new path with ✅ prefix
    const archivedPath = '4 Archive/✅ My Project.md';
    expect(vaultPathExists(archivedPath)).toBe(true);

    const archived = readVaultFile(archivedPath);
    expect(archived).toContain('completed:');
  });
});
```

- [ ] **Step 4: Run and verify**

```bash
npm run build && npm run test:e2e
```

Expected: `8 passing`

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/specs/takeProjectTask.e2e.ts tests/e2e/specs/dropTaskToProject.e2e.ts tests/e2e/specs/finishProject.e2e.ts
git commit -m "feat(e2e): add takeProjectTask, dropTaskToProject, finishProject smoke tests"
```

---

### Task 6: GitHub Actions CI workflow

**Goal:** A CI workflow that runs the E2E suite on `ubuntu-latest` with Obsidian binary caching, triggered on push and pull_request.

**Files:**
- Create: `.github/workflows/e2e.yml`

**Acceptance Criteria:**
- [ ] Workflow runs on `push` and `pull_request` to `main`
- [ ] Obsidian binary is cached between runs (keyed on `obsidianVersion`)
- [ ] All 8 specs pass in CI

**Verify:** Push to branch → GitHub Actions shows green E2E job

**Steps:**

- [ ] **Step 1: Create .github/workflows/e2e.yml**

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build plugin
        run: npm run build

      - name: Cache Obsidian binary
        uses: actions/cache@v4
        with:
          path: ~/.cache/obsidian-launcher
          key: obsidian-${{ runner.os }}-latest

      - name: Run E2E tests
        run: npm run test:e2e
```

Note: The Obsidian binary cache path (`~/.cache/obsidian-launcher`) should be confirmed against wdio-obsidian-service docs — the sample plugin's CI workflow shows the exact path to cache.

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/e2e.yml
git commit -m "feat(e2e): add GitHub Actions workflow for E2E smoke tests"
git push -u origin claude/e2e-testing-vault-fZQ1Z
```

- [ ] **Step 3: Verify CI passes**

Check the Actions tab on GitHub. If Obsidian fails to start headlessly, verify `autoXvfb: true` is set in `wdio.conf.ts`. If cache path is wrong, check the `obsidian-launcher` package for its default download directory.

---

## Self-Review

**Spec coverage:**
- extractLog ✓ Task 3
- migrateTask ✓ Task 3
- pushTaskDown ✓ Task 4
- pullTaskUp ✓ Task 4
- takeProjectTask ✓ Task 5
- dropTaskToProject ✓ Task 5
- finishProject ✓ Task 5
- Local entry point (`npm run test:e2e`) ✓ Task 1
- CI entry point (GitHub Actions) ✓ Task 6
- Vault isolation (per-spec `beforeAll` creates fresh files) ✓ Tasks 3–5
- Date-aware paths (moment.js helpers) ✓ Task 2

**User verification:** NO — no human sign-off required in the spec.

**Type consistency:** `createVaultFile`, `readVaultFile`, `vaultPathExists`, `openFileAtLine`, `runCommand` defined in Task 2, used consistently in Tasks 3–5.
