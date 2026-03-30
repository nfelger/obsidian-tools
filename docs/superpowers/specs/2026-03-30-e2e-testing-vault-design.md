# E2E Testing with Real Obsidian Vault

**Date:** 2026-03-30
**Status:** Approved

## Goal

Add a smoke-test layer that runs every plugin command against a real Obsidian instance,
giving confidence before loading into a personal vault. One happy-path trace per command,
no edge-case coverage. Complements — does not replace — the existing Vitest unit and
integration tests.

## Chosen Tool

**`wdio-obsidian-service`** — the community-converging solution for real-Obsidian E2E testing.
Automatically downloads the Obsidian binary, handles Xvfb on Linux, and integrates with
WebdriverIO + Mocha. Actively maintained as of 2025–2026 and listed on the official
WebdriverIO docs site.

## Architecture

Two independent test layers that coexist:

| Layer | Runner | Entry point | When to run |
|---|---|---|---|
| Unit + integration | Vitest | `npm test` | Every commit |
| E2E smoke | WebdriverIO + Mocha | `npm run test:e2e` | Pre-release / CI |

The E2E layer lives entirely in `tests/e2e/`. It has no dependency on the Vitest suite and
no shared test helpers.

## Directory Layout

```
tests/e2e/
├── wdio.conf.ts              # WebdriverIO + wdio-obsidian-service config
├── fixtures/
│   └── vault/               # Checked-in fixture vault
│       ├── .obsidian/
│       │   ├── plugins/
│       │   │   └── bullet-flow/  # Symlinked or copied built plugin
│       │   └── community-plugins.json
│       ├── +Diary/
│       │   └── <year>/<month>/   # Daily and weekly notes
│       ├── 1 Projekte/
│       │   └── My Project.md
│       └── Areas/
│           └── My Area.md
├── specs/
│   ├── extractLog.e2e.ts
│   ├── migrateTask.e2e.ts
│   ├── pushTaskDown.e2e.ts
│   ├── pullTaskUp.e2e.ts
│   ├── takeProjectTask.e2e.ts
│   ├── dropTaskToProject.e2e.ts
│   └── finishProject.e2e.ts
└── helpers/
    └── vault.ts             # resetVault(), readVaultFile(), runCommand(), openFileAtLine()
```

## Fixture Vault

The fixture vault is a minimal Obsidian vault checked into the repo at
`tests/e2e/fixtures/vault/`. It contains just enough markdown files to exercise each
command once. Settings in `.obsidian/` are configured to match `DEFAULT_SETTINGS` so no
per-test settings setup is needed.

The vault is structured around the default settings:
- Periodic notes live in `+Diary/` with patterns `YYYY/MM/YYYY-MM-DD ddd` (daily) and
  `gggg/MM/gggg-MM-[W]WW` (weekly).
- Projects live in `1 Projekte/`.
- Finished projects are moved to `4 Archive/`.

**Fixture files needed:**

| File | Purpose |
|---|---|
| `+Diary/<year>/<month>/<today>.md` | Today's daily note — source for migrateTask, pullTaskUp, dropTaskToProject; target for pushTaskDown, takeProjectTask |
| `+Diary/<year>/<month>/<tomorrow>.md` | Next daily note — target for migrateTask |
| `+Diary/<year>/<month>/<this-week>.md` | This week's weekly note — source for pushTaskDown; target for pullTaskUp |
| `1 Projekte/My Project.md` | Project note — source for takeProjectTask and finishProject; target for dropTaskToProject |
| `Areas/My Area.md` | Area note — target for extractLog |
| `4 Archive/` | Empty folder — destination for finishProject |

All fixture files have a `## Log` section (periodic notes) or `## Todo` section (project
notes) pre-populated, matching the default target heading settings.

## Test Isolation

Before each spec file runs, `resetVault()` copies the fixture vault to a fresh temp
directory (`os.tmpdir()/bullet-flow-e2e-<random>/`). The WebdriverIO config points Obsidian
at this temp directory via `obsidianVault`. This ensures each spec starts from a known
clean state regardless of what previous specs did.

## Command Invocation

Commands are invoked via JavaScript injection into the Obsidian window — not through the
command palette UI. This avoids UI brittleness while still exercising the real command
registration and execution path.

```typescript
// In vault.ts helper
export async function runCommand(commandId: string) {
  await browser.execute((id: string) => {
    (window as any).app.commands.executeCommandById(`bullet-flow:${id}`);
  }, commandId);
  await browser.pause(500); // allow async command to settle
}

export async function openFileAtLine(vaultRelPath: string, line: number) {
  await browser.execute((path: string, ln: number) => {
    const file = (window as any).app.vault.getAbstractFileByPath(path);
    // exact workspace navigation API to be confirmed against Obsidian 1.x during implementation
    (window as any).app.workspace.getLeaf().openFile(file).then(() => {
      const editor = (window as any).app.workspace.activeEditor?.editor;
      editor?.setCursor({ line: ln, ch: 0 });
    });
  }, vaultRelPath, line);
  await browser.pause(300);
}
```

## Assertions

After each command runs, tests read files directly from the temp vault directory on disk
using Node.js `fs.readFileSync`. This is simple, reliable, and matches how the existing
integration tests reason about output — given input, assert output.

```typescript
export function readVaultFile(vaultDir: string, relPath: string): string {
  return fs.readFileSync(path.join(vaultDir, relPath), 'utf8');
}
```

## Smoke Test Coverage (One Trace Per Command)

| Command | Active file | Input state | Expected output |
|---|---|---|---|
| `extractLog` | `extract-log` | Daily note; cursor on `- [[My Area]] some text` with child bullets | Children moved to `My Area.md` under `## Log`; source bullet wikilink updated to section anchor (`[[My Area#...\|My Area]]`) |
| `migrateTask` | `migrate-task` | Today's daily note; cursor on `- [ ] A task` | Task copied to tomorrow's daily note under `## Log`; source task marked `[>]` |
| `pushTaskDown` | `push-task-down` | This week's weekly note; cursor on `- [ ] A task` | Task copied to today's daily note under `## Log`; source task marked `[<]` |
| `pullTaskUp` | `pull-task-up` | Today's daily note; cursor on `- [ ] A task` | Task copied to this week's weekly note under `## Log`; source task marked `[<]` |
| `takeProjectTask` | `take-project-task` | `My Project.md`; cursor on `- [ ] Project task` under `## Todo` | Task copied to today's daily note under `## Log` with `[[My Project]]` prefix; source task marked `[<]` |
| `dropTaskToProject` | `drop-task-to-project` | Today's daily note; cursor on `- [ ] [[My Project]] A task` | Task added to `My Project.md` under `## Todo` (without the `[[My Project]]` prefix); task line deleted from daily note |
| `finishProject` | `finish-project` | `My Project.md` | File moved to `4 Archive/✅ My Project.md`; `completed: <date>` added to frontmatter |

## Entry Points

**Local:**
```json
"test:e2e": "wdio run tests/e2e/wdio.conf.ts"
```

**CI — `.github/workflows/e2e.yml`:**
- Trigger: `push` to `main`, `pull_request`
- Runner: `ubuntu-latest`
- Steps: checkout → `npm ci` → `npm run build` → `wdio run tests/e2e/wdio.conf.ts`
- `autoXvfb: true` in `wdio.conf.ts` handles the headless display
- Obsidian binary cached via `actions/cache` keyed on the Obsidian version pinned in config

## wdio.conf.ts Key Settings

```typescript
services: [
  ['obsidian', {
    obsidianVersion: 'latest',  // or pin to a specific version
    autoXvfb: true,
  }]
],
framework: 'mocha',
specs: ['tests/e2e/specs/**/*.e2e.ts'],
```

## What This Does Not Cover

- Edge cases (those stay in the Vitest integration layer)
- Mobile emulation
- Settings UI interactions
- Auto-move (CM6 extension — requires real typing events, out of scope for this phase)

## Decision Deferred

Once the E2E layer is working and the team has a feel for its reliability and speed,
decide how many integration tests to convert to E2E and whether to retire duplicated
Vitest integration coverage.
