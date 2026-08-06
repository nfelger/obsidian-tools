# Maintainability Sensors for Coding Agents

Date: 2026-08-06
Scope: proposal for structural code-quality support in Bullet Flow, framed by Birgitta
Böckeler's [maintainability sensors](https://martinfowler.com/articles/sensors-for-coding-agents.html)
model and evaluated concretely against [Fallow](https://github.com/fallow-rs/fallow) 3.14.0.

> **Status: proposal.** Nothing in §4–§10 is implemented. Every command in this document
> was run against this repository at the commit above; the baseline in §3 is measured, not
> estimated. Findings are marked **[verified]** where the underlying code was read to
> confirm the tool was right, and **[false positive]** where it was not.
>
> This document deliberately contains numbers, which `CLAUDE.md` bans for documentation.
> A sensor baseline *is* a measurement snapshot — the numbers are the point, and they are
> scoped to §3 and dated. They are not maintained; re-measure rather than trust them.

---

## 1. The model, briefly

Böckeler splits an agent harness into two control vectors:

- **Guides (feed-forward)** — instructions that shape output *before* the agent acts:
  `CLAUDE.md`, `docs/key-insights.md`, the `code-reviewer` agent.
- **Sensors (feedback)** — checks that observe *after* the agent acts, so it can
  self-correct. Sub-split into **computational** (deterministic, fast — tests, type
  checkers, linters, structural analysis) and **inferential** (LLM-as-judge — slower,
  non-deterministic).

Three claims from the article matter most here:

1. **A sensor's purpose is agent self-correction, not human reporting.** If the signal
   only reaches a human after the agent has stopped, the human *is* the feedback loop.
2. **Format sensor output for LLM consumption.** The message must carry the fix, not just
   the flag — "exceeds complexity threshold; extract into smaller single-responsibility
   functions" beats "complexity 32 > 15".
3. **Watch the exceptions the agent creates.** Böckeler's sharpest empirical finding is
   that agents suppress warnings and *raise thresholds* rather than refactor — and that
   the diff of suppressions is the highest-signal place to start a code review.

## 2. What this repo already has

This is not a greenfield harness. Bullet Flow already practises sensor engineering
without the vocabulary:

| Existing | Model role |
|---|---|
| `CLAUDE.md`, `tests/CLAUDE.md`, `docs/key-insights.md`, `WORKFLOW.md` | Guides |
| `.claude/agents/code-reviewer.md` | Inferential sensor |
| Vitest suite | Computational sensor |
| `tsc -noEmit` in `npm run build` | Computational sensor |
| `.githooks/pre-commit` — planning-comment ban, CHANGELOG-with-version | Custom computational sensors |
| `.githooks/check-claude-md-structure` | **A sensor that validates a guide** |
| `.githooks/pre-push` — version bump required | Custom computational sensor |

`check-claude-md-structure` deserves special mention: it verifies the structure diagram
in `CLAUDE.md` against the real directory layout. That is the model in its most advanced
form — a guide kept honest by a sensor, so it cannot rot into a lie the agent then trusts.
The proposals below are a completion of this existing instinct, not a new philosophy.

**The four gaps:**

- **G1 — No sensor fires during the agent's turn.** Every check above runs at
  commit, push, or CI. An agent edits files, ends its turn, and a human discovers the
  problem. This is the gap that matters most, and it is the cheapest to close.
- **G2 — No linter of any kind.** There is no ESLint, Oxlint, or Biome config in the
  repo. The article's baseline sensor layer is entirely absent. `tsc` covers types, not
  maintainability, and only over `src/**` (`tsconfig.json` `include`) — tests are never
  type-checked.
- **G3 — No cross-file or structural sensor.** Böckeler notes linting targets
  file- and function-level risk, while the expensive maintainability problems cross
  module boundaries. Nothing here measures duplication, dead code, or layering.
- **G4 — Rich architectural invariants exist only as prose.** `CLAUDE.md` and
  `docs/key-insights.md` document the layering rule, the adapter pattern, "all shared
  types in `types.ts`", `TaskMarker` as the only way to touch markers, and the
  collect → write-target → mutate-source phase order. None is machine-checked. Every
  one is a guide the agent may silently violate.

## 3. Measured baseline

Environment: `npm ci` clean, `fallow@3.14.0`, `oxlint@latest`, full git history.
Test suite green (677 tests / 23 files / 4.5s). `npm run build` exits 0.

**Fallow, whole repo:** maintainability index 91.1 (good), 0 dead files, 77 files.
Dead code 10 issues; duplication 1,310 lines (16.2%) across 11 files; complexity 18
functions above threshold.

**Scoped to `src/` only** (`--production`, excludes tests):

- Duplication **251 lines (4.8%) across 3 files** — all in
  `migrateTask.ts`, `pullTaskUp.ts`, `pushTaskDown.ts`. **[verified]**
- Worst complexity: `findTopLevelTasksInRange` in `src/utils/tasks.ts` — cognitive 32,
  cyclomatic 21, in a 637-line file. Also flagged: `dropTaskToProject.ts` and
  `migrateTask.ts` (both cognitive 29).

The duplication result is the strongest single argument for adopting a structural sensor.
The 2026-06-10 repo review already lists **"the shared transfer engine"** as open debt.
Fallow rediscovered that exact item from scratch, ranked it, and named the three files —
in 0.12 seconds, with no knowledge of the review. A sensor would have flagged it the day
it appeared instead of two months later.

The 16.2% whole-repo figure is dominated by `tests/helpers/*PluginTestHelper.ts`
(one clone group is 153 lines across two helpers). That is real, but it is a deliberate
per-command helper-factory pattern per `tests/CLAUDE.md`; treat it as a baseline to
quarantine, not a fire to fight (§6).

**Oxlint, zero config:** 14 warnings, all real and all trivial. Notably an unused `TFile`
import in **four** command files (`migrateTask`, `pullTaskUp`, `pushTaskDown`,
`takeProjectTask`) — evidence of copy-paste drift between exactly the files Fallow
flagged for duplication. Also `taskIndent`/`blankIdx`-style unused locals and a
redundant regex escape in `src/utils/listItems.ts`.

**Findings triaged:**

| Finding | Verdict |
|---|---|
| `CollectorLineShape` unused type export (`projects.ts:194`) | **[verified]** — used only inside its own file; drop the `export` |
| `@wdio/types` unlisted dependency | **[verified]** — type-imported in `wdio.conf.ts`, absent from `package.json` |
| `obsidian-daily-notes-interface` devDep used in production | **[verified]** — not in esbuild `external`, so it is bundled |
| `BulletFlowSettingTab.display` unused class member | **[false positive]** — Obsidian `PluginSettingTab` lifecycle override |
| `@wdio/local-runner`, `@wdio/mocha-framework`, `@wdio/spec-reporter`, `wdio-obsidian-service` unused | **[false positive]** — invoked by the wdio runner, never imported |
| `@codemirror/state`, `@codemirror/view` devDeps in production | **[false positive]** — listed in esbuild `external`, correctly devDeps |

Six false positives out of ten dead-code findings is the honest adoption cost. All six are
one-time config, given in §6.

## 4. P1 — Put a sensor inside the agent's turn

**The highest-leverage change in this document.** `.claude/settings.json` is currently
`{}`. Closing G1 means an agent cannot end a turn having regressed quality.

The design decision that matters is **which sensor fires when**. Running everything on
every edit is actively harmful: mid-refactor, an agent legitimately has transient dead
code and duplication, and a sensor that screams about it will push the agent to
"fix" work it was about to finish. Split by blast radius:

- **`PostToolUse` on `Edit|Write` → Oxlint on the edited file only.** File-local,
  unambiguous, sub-100ms. Unused imports and dead locals are never legitimately
  transient.
- **`Stop` → `fallow audit` + `npm test`.** The "am I actually done?" gate, where
  whole-changeset judgements belong. Total cost is ~5s against a 4.5s suite and a
  0.3s Fallow run — affordable on every turn.

This is backpressure: the agent is blocked from claiming completion until the
changed-file gate passes.

Fallow will scaffold the `Stop` half itself:

```bash
npx fallow hooks install --target agent --agent claude
```

Verified via `--dry-run`: it updates `.claude/settings.json` (1 handler) and creates
`.claude/hooks/fallow-gate.sh`. Do **not** pass `--gitignore-claude` — the hook and
settings should be tracked, since the point is that the whole team's agents inherit them.

Per §1's second claim, the hook's failure text should be written for an LLM. Not
"fallow audit failed (exit 1)" but a message naming the finding, the file, and the
expected remedy, plus an explicit instruction that raising a threshold or adding a
suppression is not an acceptable resolution — see §8.

## 5. P2 — Add the missing linter layer (Oxlint)

Closes G2. Recommend **Oxlint** over ESLint specifically because of §4: a sensor that
runs on every `Edit` must cost milliseconds, and ESLint's startup does not fit that
budget. Oxlint needs no config to be useful today (14 real findings), ships as a single
binary, and is built on Oxc — the same parser Fallow uses, so the two agree about syntax.

```bash
npm i -D oxlint
```

```jsonc
// package.json scripts
"lint": "oxlint src tests",
"lint:fix": "oxlint --fix src tests"
```

The usual reason to prefer `typescript-eslint` is its type-aware maintainability rules —
but complexity, duplication, and dead code are exactly what Fallow covers here, and
covers across file boundaries. Adding ESLint too would mean two overlapping sensors
disagreeing about the same finding. Start with Oxlint; add `typescript-eslint` later only
for a specific rule Fallow cannot express.

Two cheap adjacent wins while in the area:

- **Type-check tests.** `tsconfig.json` includes only `src/**/*.ts`. Add a
  `tsconfig.test.json` extending it with `tests/**` so the largest body of code in the
  repo gets a type sensor at all.
- **`tsconfig.json` uses `baseUrl` and `moduleResolution: node`**, both deprecated and
  removed in TypeScript 7. Harmless today (`typescript` is pinned `^5.3.0`), but it is a
  known future break worth an issue.

## 6. P3 — Adopt Fallow gated on *new* findings only

Closes G3. The adoption problem is §3's 16.2% duplication: a tool that fails on day one
gets disabled on day two. `fallow audit` is built for exactly this — it defaults to
`gate: "new-only"`, computing a base snapshot and failing only on findings the changeset
*introduced*, reporting inherited ones with `introduced: false` attribution.

Verified on this branch: `fallow audit` correctly scoped to the merge-base with
`origin/main` and exited 0.

Proposed `.fallowrc.json`, with all six §3 false positives suppressed:

```jsonc
{
  "$schema": "./node_modules/fallow/schema.json",
  "entry": ["src/main.ts"],

  // Invoked by the wdio CLI, never imported — see tests/e2e/wdio.conf.ts
  "ignoreDependencies": [
    "@wdio/local-runner",
    "@wdio/mocha-framework",
    "@wdio/spec-reporter",
    "wdio-obsidian-service"
  ],

  // Obsidian lifecycle overrides: called by the framework, not by us
  "usedClassMembers": ["display", "onload", "onunload", "onOpen", "onClose"],

  "health": {
    // Agents suppress rather than refactor; keep exceptions visible in config
    "suggestInlineSuppression": false
  },

  "audit": {
    "gate": "new-only",
    "deadCodeBaseline": ".fallow/dead-code-baseline.json",
    "healthBaseline": ".fallow/health-baseline.json",
    "dupesBaseline": ".fallow/dupes-baseline.json"
  }
}
```

`suggestInlineSuppression: false` is the one non-obvious line. It defaults to `true`,
which makes Fallow emit `suppress-line` action hints in its JSON output — that is, it
*suggests to the agent that it suppress the finding*. Given Böckeler's finding that
agents already prefer suppression to refactoring, leaving that on hands them a
pre-authorised escape hatch. Turn it off.

Baselines are saved on a clean ref, once:

```bash
npx fallow dead-code --save-baseline && npx fallow health --save-baseline \
  && npx fallow dupes --save-baseline
```

`@codemirror/*` and `obsidian-daily-notes-interface` are left unsuppressed on purpose:
the first two are advisory `warn` severity, and the third is a **[verified]** real
finding worth fixing rather than hiding.

Pin the version (`npm i -D fallow`) rather than relying on `npx …@latest`, so a
release of the tool cannot turn CI red on an unchanged codebase — a sensor must be
deterministic across time, not just across runs.

## 7. P4 — Turn the architecture prose into boundary rules

Closes G4, at least partially. `CLAUDE.md` states: *"Expose Obsidian types only at the
boundary. Domain interfaces must not reference `TFile` or other Obsidian types."*

Measured against reality, that rule is mostly held but already drifting:

| File | Obsidian import | Compliant? |
|---|---|---|
| `src/types.ts` | none | ✅ the rule's core claim holds |
| `src/utils/wikilinks.ts` | `import type { MetadataCache, Vault }` | ✅ type-only, as documented |
| `src/utils/periodicNoteCreator.ts` | `import type { TFile }` + `import { moment }` | ✅ documented as the plugin boundary |
| `src/utils/periodicNotes.ts` | `import { moment }` — runtime value | ⚠️ documented as pure path/week math |
| `src/utils/commandSetup.ts` | `MarkdownView, Notice, TFile, Vault, Editor` — runtime | ⚠️ infrastructure living in `utils/` |

Neither ⚠️ is a bug — `moment` is a date utility, and `commandSetup` is honestly named.
But the prose says "domain logic has no Obsidian types" while `utils/` contains two files
that do, and nothing prevents the third. Fallow's `boundaries` supports `allowTypeOnly`
targets, which expresses this rule precisely:

```jsonc
"boundaries": {
  "zones": [
    { "name": "entry",    "patterns": ["src/main.ts", "src/settings.ts"] },
    { "name": "adapters", "patterns": ["src/utils/periodicNoteCreator.ts",
                                        "src/utils/commandSetup.ts"] },
    { "name": "commands", "patterns": ["src/commands/**", "src/events/**"] },
    { "name": "domain",   "patterns": ["src/utils/**", "src/types.ts"] }
  ],
  "rules": [
    { "from": "commands", "allow": ["domain", "adapters"] },
    { "from": "domain",   "allow": ["domain"] }
  ]
}
```

Rather than adopt this wholesale, the honest first step is a decision: either
`periodicNotes.ts` and `commandSetup.ts` move to an explicit adapter zone (making the
prose true), or the prose relaxes to describe what is actually built. **A sensor forces
that decision instead of letting the gap widen.** That is the real value here — not the
config, but the fact that ambiguity becomes a build failure.

Note the invariants a boundary rule still cannot express: the collect → write-target →
mutate-source phase order, and "never manipulate task markers as raw strings". Those stay
guides, enforced by the `code-reviewer` agent — a reasonable division, and worth stating
in `CLAUDE.md` so it is clear which rules are enforced and which are trusted.

## 8. P5 — An exception ledger (the sharpest cheap win)

This implements §1's third claim, and it is the proposal with the best
value-to-effort ratio in the document.

If P1–P4 land, the agent gains four new ways to make a red signal green *without
improving anything*: an `// fallow-ignore` comment, an `// oxlint-disable` comment, a
raised number in `health`, or a new entry in `ignoreDependencies`. Böckeler observed
agents reaching for precisely these.

The repo already has the perfect machinery — `.githooks/pre-commit` greps staged files
for banned patterns. Extend it:

```sh
# Hook 4: Surface newly added quality suppressions for explicit review.
SUPPRESSIONS=$(git diff --cached -U0 -- 'src/**' 'tests/**' \
  | grep -E '^\+' | grep -E 'fallow-ignore|oxlint-disable|eslint-disable|@expected-unused')

THRESHOLDS=$(git diff --cached -U0 -- .fallowrc.json \
  | grep -E '^\+' | grep -E 'maxCognitive|maxCyclomatic|maxCrap|maxUnitSize|ignoreDependencies')

if [ -n "$SUPPRESSIONS" ] || [ -n "$THRESHOLDS" ]; then
  echo "Quality suppression added. This is allowed, but never the default fix."
  echo "Confirm the finding cannot be resolved by refactoring, and that the"
  echo "suppression carries a '--' reason explaining why. To proceed: --no-verify."
  echo ""
  echo "$SUPPRESSIONS$THRESHOLDS"
  exit 1
fi
```

Two deliberate design choices. First, it **blocks rather than warns**, because a
warning printed to a hook's stdout is a warning an agent will not act on. Second, the
message is written for an LLM per §1: it states the fix (refactor, or document a reason),
not merely the violation.

Prefer Fallow's `health.thresholdOverrides` to inline suppressions where a genuine
exception exists — it keeps the exception a visible numeric ceiling in config rather
than a comment buried in a file nobody re-reads.

## 9. P6 — Coverage-weighted complexity

`npm run test:coverage` exists but gates nothing, and §3's CRAP scores are Fallow's own
estimates: *"CRAP scores are estimated from export references; run `fallow health
--coverage <coverage-final.json>` for exact scores."*

These two facts fix each other. CRAP weights complexity by test coverage, which is a
far better maintainability signal than either alone — a complex, well-tested function is
fine; a complex, untested one is where bugs live.

```bash
npx fallow audit --coverage coverage/coverage-final.json
```

Requires `coverage-final.json` in the vitest coverage reporters, then set
`health.coverage` in `.fallowrc.json` so CI and local runs agree. Add a coverage floor to
`vitest.config.js` at the level the suite already achieves — a ratchet, not a target.

## 10. Sequencing

Ordered by leverage per unit of effort. P1 and P2 are worth doing this week; the rest can
follow.

| # | Change | Effort | Closes |
|---|---|---|---|
| P2 | Oxlint + `lint` script, fix the 14 findings | ~1h | G2 |
| P1 | Agent hooks: Oxlint on `PostToolUse`, `fallow audit` + tests on `Stop` | ~1h | **G1** |
| P5 | Exception ledger in `pre-commit` | ~30m | — |
| P3 | Pinned Fallow + `.fallowrc.json` + baselines + CI job | ~2h | G3 |
| P6 | Coverage-weighted CRAP + coverage floor | ~1h | — |
| P4 | Boundary zones, after deciding the `utils/` question | ~2h | G4 |

**Rewrite the existing hook messages for LLM consumption** alongside P5 — the current
"Error: planning comments found in staged .ts files." becomes materially more useful with
the remedy attached. It is a ten-minute change and it is the article's most distinctive
recommendation.

**CI** (`.github/workflows/ci.yml`) gains `npm run lint` and `npx fallow audit` as steps.
Keep `audit` (changed-files, new-only) in PR CI rather than a full `fallow` run, so the
inherited baseline never blocks a PR that did not cause it.

### First payload of real fixes

Available now, independent of any tooling decision:

1. Remove the unused `TFile` import from `migrateTask.ts`, `pullTaskUp.ts`,
   `pushTaskDown.ts`, `takeProjectTask.ts`, plus the other Oxlint findings.
2. Drop `export` from `CollectorLineShape` (`src/utils/projects.ts:194`).
3. Add `@wdio/types` to `devDependencies`.
4. Move `obsidian-daily-notes-interface` to `dependencies` (it is bundled, not external).
5. File an issue for the shared transfer engine, citing the 4.8% duplication across
   `migrateTask`/`pullTaskUp`/`pushTaskDown` and the 2026-06-10 review's open item.
6. File an issue for `findTopLevelTasksInRange` (cognitive 32) in `src/utils/tasks.ts`.

## 11. What not to do

- **Do not gate on the 16.2% whole-repo duplication.** It is concentrated in the
  test-helper factories that `tests/CLAUDE.md` prescribes. Baseline it.
- **Do not add ESLint alongside Oxlint** without a specific rule that needs it. Two
  linters disagreeing about one finding trains agents to ignore both.
- **Do not enable `--type-aware` in the agent loop.** It is slower and needs a
  sidecar; reserve it for deliberate refactors (`fallow dead-code --type-aware
  --symbol-impact`), where exact symbol identity actually pays for itself.
- **Do not let sensors erode the core design principle.** `CLAUDE.md` is explicit that
  the markdown file *is* the state. No sensor here should ever motivate a metadata,
  query, or caching layer to make itself easier to compute.
