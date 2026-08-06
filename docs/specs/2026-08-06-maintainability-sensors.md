# Maintainability Sensors for Coding Agents

Date: 2026-08-06
Scope: proposal for structural code-quality support in Bullet Flow, framed by Birgitta
Böckeler's [maintainability sensors](https://martinfowler.com/articles/sensors-for-coding-agents.html)
(27 May 2026) and evaluated concretely against [Fallow](https://github.com/fallow-rs/fallow)
3.14.0, Oxlint, and Stryker.

> **Status: proposal.** Nothing below is implemented. Every command quoted was run against
> this repository at the commit above; §3 is measured, not estimated. Findings are marked
> **[verified]** where the code was read to confirm the tool was right, **[false positive]**
> where it was not.
>
> **Revision note:** this document was first drafted from secondary summaries of the
> article, then revised against the full text. Three recommendations reversed outright and
> one was empirically refuted; they are marked **[revised]** with the reasoning kept
> visible, because the reversals are more instructive than the conclusions.
>
> This document contains numbers, which `CLAUDE.md` bans for documentation. A sensor
> baseline *is* a measurement snapshot — the numbers are the point, and they are dated and
> scoped to §3. They are not maintained; re-measure rather than trust them.

---

## 1. The model

Böckeler splits an agent harness into **guides** (feed-forward: instructions that shape
output before the agent acts) and **sensors** (feedback: checks that observe after it acts,
so it can self-correct). Sensors are **computational** (deterministic, fast — type
checkers, linters, tests, structural rules) or **inferential** (LLM-as-judge — slower,
non-deterministic, semantic).

She runs sensors at four points: *during the coding session* (fast, continuous), *in CI*
(same checks, clean infrastructure, post-integration), *repeatedly on a slow cadence*
(drift that accumulates rather than errors in the moment), and *in production*.

Her load-bearing claims, in the order they matter here:

1. **A sensor exists so the agent can self-correct.** "Ideally, we want to give the agent
   extra context for that self-correction — a good kind of prompt injection."
2. **The message must carry the guidance.** She built a custom ESLint formatter to
   override default messages with project-specific instructions.
3. **The AI failure modes that static analysis catches best** are max function arguments,
   file length, function length, and cyclomatic complexity — and **none of these are in
   default presets.** You must configure them.
4. **Suppressions and threshold increases are the mechanism, not the enemy.** Agents make
   a "clean house" baseline feasible for the first time. Thresholds may be *ratcheted*: an
   increase preserves the constraint and re-fires if things worsen, avoiding "a binary
   suppress-or-comply choice." The diff of exceptions is where code review should start.
5. **Computational sensors impressed her at file/function level; cross-file coupling data
   did not.** Raw coupling metrics were "quite lackluster" as agent input and flagged
   deliberate patterns as defects. Dependency *rules* worked well; coupling *metrics*
   belong in human review triage.
6. **Coverage tells you a line executed, not that its impact was verified.** Mutation
   testing is what closes that gap, and it becomes crucial once tests are AI-written.
7. **Beware feedback overload** — "sending it into a spiral of over-engineered
   refactorings" — and rule conflicts, e.g. `max-lines` pushing complexity out of
   functions and into property-passing chains.

## 2. What this repo already has

This is not a greenfield harness. Bullet Flow already practises sensor engineering without
the vocabulary:

| Existing | Model role |
|---|---|
| `CLAUDE.md`, `tests/CLAUDE.md`, `docs/key-insights.md`, `WORKFLOW.md` | Guides |
| `.claude/agents/code-reviewer.md` | Inferential sensor (on demand) |
| Vitest suite, coverage thresholds at 75% | Computational sensor |
| `tsc -noEmit` in `npm run build` | Computational sensor |
| `.githooks/pre-commit` — planning-comment ban, CHANGELOG-with-version | Custom computational sensors |
| `.githooks/check-claude-md-structure` | **A sensor that validates a guide** |
| `.githooks/pre-push` — version bump required | Custom computational sensor |

`check-claude-md-structure` deserves attention: it verifies the structure diagram in
`CLAUDE.md` against the real directory layout — a guide kept honest by a sensor, so it
cannot rot into a lie the agent then trusts. Böckeler's closing open question is *"once we
feel confident in a set of sensors, what guides can we delete?"* This repo has
independently arrived at a different answer: keep the guide, and sense it. Worth knowing
that is a deliberate position, because §7 offers the alternative.

**The four gaps:**

- **G1 — No sensor fires during the agent's turn.** Everything runs at commit, push, or
  CI. An agent edits, ends its turn, and a human finds the problem. Böckeler's entire
  first category — "sensors that run continuously alongside the agent" — is absent.
- **G2 — No linter of any kind.** No ESLint, Oxlint, or Biome config exists. Per §1.3
  this is also where the highest-yield AI-specific rules live, and they need explicit
  configuration.
- **G3 — No structural sensor.** Nothing measures duplication, dead code, or layering.
- **G4 — Architectural invariants exist only as prose.** The layering rule, the adapter
  pattern, "all shared types in `types.ts`", `TaskMarker`-only marker access, and the
  collect → write-target → mutate-source phase order are all guides. None is checked.

There is also **no inferential sensor on a cadence** — no scheduled modularity or design
review. §9 argues that is the gap with the highest ceiling, because it was the single most
productive experiment in the article.

## 3. Measured baseline

Clean `npm ci`, full git history, `fallow@3.14.0`, `oxlint@latest`. Suite green: 677 tests
/ 23 files / 4.5s. `npm run build` exits 0. Coverage 90.66% statements.

**Fallow, whole repo:** maintainability 91.1 (good), 0 dead files. Dead code 10 issues;
duplication 1,310 lines (16.2%) across 11 files; 18 functions above complexity threshold.

**Scoped to `src/`** (`--production`): duplication **251 lines (4.8%) across exactly three
files** — `migrateTask.ts`, `pullTaskUp.ts`, `pushTaskDown.ts`. **[verified]**

That result is the strongest argument in this document. The 2026-06-10 review already lists
**"the shared transfer engine"** as open debt. Fallow rediscovered it from scratch, ranked
it, and named the three files in 0.12s with no knowledge of the review. Independently,
Oxlint found an unused `TFile` import in *four* command files — the same copy-paste drift
from a different angle. Böckeler's matching observation: *"AI agents usually don't go ahead
and start refactoring without an explicit nudge when they repeat a piece of code for the
third or fourth time, they are quite happy to copy and paste."*

The 16.2% whole-repo figure is dominated by `tests/helpers/*PluginTestHelper.ts` (one clone
group is 153 lines across two helpers). Real, but it is the per-command helper-factory
pattern `tests/CLAUDE.md` prescribes. Baseline it; do not fight it.

**Oxlint, zero config:** 14 warnings, all real and all trivial — the four unused `TFile`
imports, unused locals (`taskIndent`, `blankIdx`), a redundant regex escape in
`src/utils/listItems.ts`.

**Dead-code triage:**

| Finding | Verdict |
|---|---|
| `CollectorLineShape` unused type export (`projects.ts:194`) | **[verified]** — used only inside its own file; drop the `export` |
| `@wdio/types` unlisted dependency | **[verified]** — type-imported in `wdio.conf.ts`, absent from `package.json` |
| `obsidian-daily-notes-interface` devDep used in production | **[false positive]** — bundled, but see below |
| `BulletFlowSettingTab.display` unused class member | **[false positive]** — Obsidian `PluginSettingTab` lifecycle override |
| 4 × `@wdio/*` / `wdio-obsidian-service` unused | **[false positive]** — invoked by the wdio CLI, never imported |
| `@codemirror/state`, `@codemirror/view` devDeps in production | **[false positive]** — in esbuild `external`, correctly devDeps |

Seven false positives out of ten is the honest adoption cost. All are one-time config (§6).

**[revised] `obsidian-daily-notes-interface` was first marked verified — wrong.** It *is*
bundled rather than externalised, so Fallow reads it as production code, and that much is
correct. But the rule's advice ("move to `dependencies`") assumes a Node app where
`dependencies` are installed at runtime. An Obsidian plugin ships a single bundled
`main.js`; nobody ever installs its dependency tree, so every dependency is build-time by
construction and `devDependencies` is the correct home. This is precisely the class of
finding Böckeler warns about — a legitimate pattern surfacing as a defect — and it argues
for suppressing the rule with a reason rather than restructuring the manifest to satisfy it.

### 3.1 The finding that reorders everything

Fallow's default CRAP scores are estimates. Feeding it real coverage changes the answer
completely:

| | Estimated | With real coverage |
|---|---|---|
| Top target | `src/utils/tasks.ts`, CRAP 462 | `src/events/autoMoveCompleted.ts:47`, **CRAP 110.0, 0% tested** |
| 2nd | `dropTaskToProject.ts`, CRAP 462 | `createPeriodicNoteFromTemplate`, CRAP 106.4, 40% tested |
| 3rd | `migrateTask.ts`, CRAP 462 | `performAutoMove`, CRAP 56.0, 0% tested |

The estimated run flattened everything to 462 and said "start with `tasks.ts`". The real
run says the risk is concentrated in `src/events/autoMoveCompleted.ts` — cyclomatic 10,
cognitive 13, and **entirely untested**. Coverage by directory: `src/utils` 97.66%,
`src/commands` 97.19%, **`src/events` 0%**.

This is Böckeler's §1.6 point in miniature, on this codebase. 90.66% overall coverage looks
healthy and hides a complex, untested decision branch. The split is understandable —
`src/utils/autoMove.ts` (the computation) has a 531-line test file, while
`src/events/autoMoveCompleted.ts` (the CM6 wiring that decides *when* to move) has none —
but the untested part still contains a cyclomatic-10 arrow function. Neither coverage alone
nor complexity alone surfaces this. Only the product does.

**Re-measured after rebasing onto v0.16.1, and the finding survived a partial fix.** Main
independently added an integration test for the auto-move extension, taking `src/events`
from 0% to 74.55%. The *specific* function stayed untested, and its CRAP score went up
rather than down — `detectAutoMoveCandidate` measured **CRAP 132.0 at 0% covered**, still
the highest in the codebase, because the surrounding file had grown. A directory-level
coverage number improving while the riskiest function inside it stays untouched is the
sharpest possible illustration of why the product of complexity and coverage is the signal,
not either input. It is now tested (§11).

**Blocker [verified]:** Fallow cannot parse vitest's default v8 coverage output —
`invalid value: integer -1, expected u32`. Switching the provider to `istanbul`
(`npm i -D @vitest/coverage-istanbul`, `--coverage.provider=istanbul`) fixes it and
produced the table above (223/223 functions matched). Anyone trying `--coverage` without
this will conclude the integration is broken.

**Config decision, not a defect:** in `--production` mode Fallow reports `periodicNotes.ts`
as "67% dead" (8 unused exports), plus similar for `autoMove.ts` and `finishProject.ts`.
These are exports used *only by tests* — `getISOWeekNumber` and friends are tested directly
per `docs/key-insights.md`. Either accept exported-for-testing and suppress, or test
through the public surface. Decide once; do not read it as dead code.

## 4. P1 — Put a sensor inside the agent's turn

**Closes G1, the highest-leverage gap.** `.claude/settings.json` is currently `{}`.

Böckeler ran sensors *continuously*, via a config-driven sidecar CLI in watch mode, which
gave the agent "a token-efficient and guidance-enriched summary" on demand — including
snapshot-based trend information ("Worse than / Same as snapshot") and a global guidance
line ("Follow scouting rule: ..."). Two architectures are available here:

- **Hooks (recommended to start).** Cheap, no new process, blocks at a decision point.
- **Sidecar-equivalent.** Fallow ships an MCP server (`npx fallow-mcp`) plus a `regression`
  baseline config — i.e. an agent-queryable sensor surface with snapshot trends, which is
  most of what her sidecar did. Worth adopting once hooks prove the signal is useful.

The design decision that matters is **which sensor fires when**. Running everything on
every edit is actively harmful — §1.7's over-engineering spiral. Mid-refactor an agent
legitimately has transient duplication and dead code, and a sensor shouting about it will
push the agent to "fix" work it was about to finish. Split by blast radius:

- **`PostToolUse` on `Edit|Write` → Oxlint on the edited file only.** File-local,
  sub-100ms, and unused imports are never legitimately transient.
- **`Stop` → `fallow audit` + `npm test`.** Whole-changeset judgements belong at the "am I
  done?" gate. ~5s total against a 4.5s suite and a 0.3s Fallow run.

That is backpressure: the agent cannot claim completion while a changed-file gate is red.

Fallow scaffolds the `Stop` half (verified via `--dry-run`: updates `.claude/settings.json`
with one handler, creates `.claude/hooks/fallow-gate.sh`):

```bash
npx fallow hooks install --target agent --agent claude
```

Do **not** pass `--gitignore-claude`. The hook and settings should be tracked — the point is
that every contributor's agent inherits them.

Per §1.1–1.2, the hook's failure text is a prompt, not a log line. Name the finding, the
file, and the expected remedy. §5 covers how.

## 5. P2 — Add the linter layer, with the AI-specific rules turned on

Closes G2. **Oxlint** over ESLint, because a `PostToolUse` sensor must cost milliseconds
and ESLint's startup does not fit that budget. Oxlint is one binary, built on Oxc — the
same parser Fallow uses, so the two agree about syntax.

**[revised] My first draft called Oxlint "useful with zero config" and stopped there.**
That misses §1.3 entirely. The zero-config run finds hygiene issues; the rules that
actually target AI failure modes are off by default and must be named. All four of
Böckeler's are verified working in Oxlint on this repo (an earlier probe of mine was too
small to trigger them and wrongly suggested they were unimplemented):

```jsonc
// .oxlintrc.json
{
  "rules": {
    "max-params":             ["error", { "max": 4 }],
    "max-lines-per-function": ["error", { "max": 60 }],
    "max-lines":             ["warn",  { "max": 400 }],
    "complexity":            ["error", { "max": 15 }],
    "max-depth":             ["error", { "max": 4 }],
    "max-statements":        ["warn",  { "max": 30 }]
  }
}
```

Start these at or slightly above today's worst case, then ratchet down (§8) — `tasks.ts` is
637 lines and `commandSetup.ts` is 372, so `max-lines: 400` is a real constraint that does
not immediately fail.

**Custom messages without switching linters.** Her mechanism is a custom ESLint formatter;
Oxlint has no formatter plugin API. But `--format json` emits a `code` field
(`eslint(max-lines)`) and a `help` field, so a ~30-line wrapper that maps rule code →
project guidance and rewrites `help` gets the same result at Oxlint's speed. Her own note
applies: AI absorbs the cost of writing this almost entirely.

Two details worth knowing. Oxlint has a **`--format agent`** output mode already, so some
of this is anticipated. And Oxlint's `complexity` rule ships with **no `help` text at all**
— empirically the exact gap Böckeler identified, where the missing self-correction guidance
was *why* her agent kept raising the cyclomatic threshold instead of refactoring. That rule
is the first one to write guidance for.

Two adjacent wins: `tsconfig.json` includes only `src/**/*.ts`, so the largest body of code
in the repo is never type-checked — add a `tsconfig.test.json` covering `tests/**`. And
`baseUrl` + `moduleResolution: node` are removed in TypeScript 7; harmless while
`typescript` is pinned `^5.3.0`, but worth an issue.

## 6. P3 — Adopt Fallow gated on *new* findings only

Closes G3. `fallow audit` defaults to `gate: "new-only"`: it computes a base snapshot and
fails only on findings the changeset *introduced*, attributing inherited ones with
`introduced: false`. That is what makes §3's 16.2% survivable — a tool that fails on day
one is disabled on day two. Verified on this branch: correctly scoped to the merge-base
with `origin/main`, exit 0.

```jsonc
// .fallowrc.json
{
  "$schema": "./node_modules/fallow/schema.json",
  "entry": ["src/main.ts"],

  // Invoked by the wdio CLI, never imported — see tests/e2e/wdio.conf.ts
  "ignoreDependencies": [
    "@wdio/local-runner", "@wdio/mocha-framework",
    "@wdio/spec-reporter", "wdio-obsidian-service"
  ],

  // Obsidian lifecycle overrides: called by the framework, not by us
  "usedClassMembers": ["display", "onload", "onunload", "onOpen", "onClose"],

  "health": { "coverage": "coverage/coverage-final.json" },

  "audit": {
    "gate": "new-only",
    "deadCodeBaseline": ".fallow/dead-code-baseline.json",
    "healthBaseline":   ".fallow/health-baseline.json",
    "dupesBaseline":    ".fallow/dupes-baseline.json"
  }
}
```

**[revised] My first draft set `health.suggestInlineSuppression: false`,** reasoning that
Fallow suggesting `// fallow-ignore-next-line` hands the agent a pre-authorised escape
hatch. The article argues the opposite and is right: suppression is *how* a clean baseline
becomes achievable, and it "keeps the suppressions manageable, visible and reviewable."
Leave it on. The control is not denying the escape hatch — it is requiring a reason and
reviewing the diff (§8). Fallow already supports the reason syntax:
`// fallow-ignore-next-line unused-export -- kept for plugin consumers`.

Baselines are saved once, on a clean ref:

```bash
npx fallow dead-code --save-baseline && npx fallow health --save-baseline \
  && npx fallow dupes --save-baseline
```

Pin the version (`npm i -D fallow`) rather than `npx …@latest`: a sensor must be
deterministic across time, not just across runs, or a tool release turns CI red on an
unchanged codebase.

**Split Fallow's output by consumer.** This follows directly from §1.5, and my first draft
conflated the two:

- **To the agent, live:** `fallow audit` (changed files, pass/fail) and boundary
  violations. Deterministic, actionable, low noise.
- **To humans, at review time:** hotspots, churn, fan-in, refactoring targets, `fallow
  viz`. Her verdict on raw coupling data as agent input was "lackluster" — it flagged a
  deliberate DI factory and a shared schema module as defects. Its real use is *risk
  triage*: knowing a changed file has 10+ callers tells a reviewer where to look. This
  repo has a natural candidate — `src/types.ts` has fan-in 29.

## 7. P4 — Turn the architecture prose into dependency rules

Closes G4. Böckeler's clearest structural win was `dependency-cruiser` rules enforcing
layers, which she found "quite a useful replacement for describing code structure in a
markdown guide." Her agent violated the rules a few times and then self-corrected.

`CLAUDE.md` states: *"Expose Obsidian types only at the boundary. Domain interfaces must
not reference `TFile` or other Obsidian types."* Measured:

| File | Obsidian import | Compliant? |
|---|---|---|
| `src/types.ts` | none | ✅ the rule's core claim holds |
| `src/utils/wikilinks.ts` | `import type { MetadataCache, Vault }` | ✅ type-only, as documented |
| `src/utils/periodicNoteCreator.ts` | `import type { TFile }` + `import { moment }` | ✅ documented as the plugin boundary |
| `src/utils/periodicNotes.ts` | `import { moment }` — runtime value | ⚠️ documented as pure path/week math |
| `src/utils/commandSetup.ts` | `MarkdownView, Notice, TFile, Vault, Editor` — runtime | ⚠️ infrastructure living in `utils/` |

Neither ⚠️ is a bug — `moment` is a date utility and `commandSetup` is honestly named. But
the prose says domain logic has no Obsidian types while `utils/` holds two files that do,
and nothing stops a third. Fallow's `boundaries` expresses this exactly, via `allowTypeOnly`:

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
  ],
  "coverage": { "requireAllFiles": true }
}
```

`requireAllFiles: true` is worth its own mention: she had to add a rule "that requires every
new file to be somewhere in the predefined folder structure" after the agent started
creating folders outside it. This is that rule, and it is also a **second sensor over the
same invariant `check-claude-md-structure` guards** — which raises the §2 question. If
boundary rules enforce the structure, the `CLAUDE.md` diagram becomes documentation rather
than a contract, and the hook could go. That is her "what guides can we delete?" question
with a concrete answer available.

The honest first step is not adopting the config — it is deciding whether
`periodicNotes.ts` and `commandSetup.ts` move to an explicit adapter zone (making the prose
true) or the prose relaxes to describe what is built. **A sensor forces that decision
instead of letting the gap widen.** That, not the config, is the value.

Note the limits: dependency rules reach only what is expressible via imports, file names,
and folders. The phase-order invariant (collect → write-target → mutate-source) and
"never manipulate task markers as raw strings" stay guides, enforced by review. Say so in
`CLAUDE.md`, so it is clear which rules are mechanical and which are trusted.

## 8. P5 — An exception ledger, as a review surface

**[revised] My first draft proposed a pre-commit hook that *blocked* on any added
suppression or threshold edit.** That is wrong, and the article says why. Threshold
ratcheting is a feature she deliberately built: the agent "may slightly increase the
thresholds if it thinks that a refactoring is unnecessary or impossible," which "doesn't
suppress the threshold forever, just increases it, so that the rule fires again if it gets
even worse in the future. Constraints are preserved without forcing a binary
suppress-or-comply choice." Blocking recreates exactly the binary she designed away — and
a blocked agent's cheapest escape is `--no-verify`.

Two corrections follow, in priority order.

**First, guidance beats gating.** Her agent over-raised the cyclomatic threshold, and she
traced the cause precisely: *"I later discovered that I didn't have a self-correction
guidance in place for this one, so there was no explicit instruction saying that a
threshold increase should be the absolute exception."* Every threshold rule needs a message
saying a raise is a last resort. Oxlint's `complexity` rule shipping with no `help` text
(§5) makes this the single highest-value message to write.

**Second, make exceptions visible rather than impossible.** Report them; do not reject them:

```sh
# Hook 4: List newly added quality exceptions. Advisory — never blocks.
EXCEPTIONS=$(git diff --cached -U0 -- 'src/**' 'tests/**' .oxlintrc.json .fallowrc.json \
  | grep -E '^\+' \
  | grep -E 'fallow-ignore|oxlint-disable|eslint-disable|@expected-unused|max-|complexity')

if [ -n "$EXCEPTIONS" ]; then
  echo "Quality exceptions added in this commit — review these first:"
  echo "$EXCEPTIONS"
  echo ""
  echo "Each suppression needs a '-- reason'. A threshold raise should be a last"
  echo "resort: prefer extracting a function. Raising is allowed when refactoring"
  echo "would genuinely hurt the design; the ratchet keeps the rule firing later."
fi
```

The one thing worth enforcing is the *reason*, not the exception — a suppression without
`--` explaining it is the only case that should fail.

Prefer Fallow's `health.thresholdOverrides` to inline suppressions where an exception is
genuine: it keeps the exception a visible numeric ceiling in config, which is the ratchet
in its most reviewable form.

## 9. P6 — Test effectiveness: coverage is not the sensor, mutation is

**[revised] My first draft claimed coverage "gates nothing".** Wrong: `vitest.config.js`
already sets 75% thresholds on lines, functions, branches, and statements, and already
emits `coverage-final.json`. The real finding is that actual coverage is 90.66% against a
75% floor — a 15-point gap where regressions can hide silently. Ratchet the floor to ~88%.

But per §1.6, that is the lesser half. Böckeler's example is a file with 100% statement
coverage, 75% branch coverage, **no unit tests at all**, and 13 surviving mutants — high
coverage supplied by one large acceptance test that executed the lines without verifying
their impact.

**Bullet Flow has that exact shape.** Its integration tests are large workflow tests
(`migrateTask.plugin.test.ts` is 737 lines, `pushTaskDown.plugin.test.ts` 667) that drive
whole commands end to end. They will execute a great deal of `src/utils` — which reports
97.66% — without necessarily asserting each branch's effect. §3.1 already shows coverage
concealing a cyclomatic-10 untested function behind a healthy-looking 90.66%.

The repo is an unusually good mutation-testing candidate:

- The domain is pure, deterministic text transformation — mutants either change output or
  they do not, with no flakiness or timing.
- `tests/CLAUDE.md` already mandates input → output verification over mock assertions,
  which is precisely the test style mutation testing rewards.
- The suite runs in 4.5s, so the usual "too resource intensive" objection is much weaker
  here than in her NextJS app.

Stryker 9.6.1 with `@stryker-mutator/vitest-runner` is current and available. Start scoped
to the highest-value target rather than the whole repo — `src/utils/tasks.ts`,
`src/utils/projects.ts`, and `src/utils/autoMove.ts` hold the logic that every command
depends on.

Two practical notes from her experience. Run it **incrementally and on demand**, not
continuously — this is a "repeatedly" sensor, not a session sensor. And Stryker writes a
very large JSON report; she wrote a small query script (`summary`, `files --changed`,
`hotspots --file`) so an agent could interrogate results without clogging its context.
Reproduce that, or the report is unusable as agent feedback.

## 10. P7 — An inferential sensor on a cadence

**The gap with the highest ceiling, and absent from my first draft.** Böckeler's most
productive experiment by a clear margin was not any computational sensor — it was an
LLM-led modularity review using Vlad Khononov's "Modularity Skills," which "proved to be
very fruitful." Her conclusion: *"codebase design and modularity seems like a concern where
computational sensors alone cannot help us much, AI is needed to add semantic
interpretation, and consider trade-offs."*

Her review found things no computational sensor did: near-identical route implementations,
a third page reimplementing an existing hook instead of reusing it, parameters threaded
through 40+ files instead of wrapped in an object, and authentication logic misplaced in a
wiring factory. Her verdict on the codebase she had built agent-first without such reviews:
*"the agent was definitely compounding inadvertent technical debt."*

Every one of those categories is plausible here. "Semantic duplication" — a fourth transfer
command reimplementing collector decomposition rather than reusing it — is the specific risk
this repo runs, and it is invisible to Fallow's exact-clone detection.

This repo has `.claude/agents/code-reviewer.md`, but it reviews a change against a plan. A
design review of the *whole* codebase on a cadence is a different sensor. Proposal: add a
`modularity-review` skill run per release rather than per change, prompted to ground itself
in `fallow health --format json` output (her framing: grounding in deterministic data raised
her confidence and cost fewer tokens than letting the agent scan the codebase).

Two cautions she verified. **Run it more than once** — a second run with no memory of the
first surfaced an issue the first missed. And **expect legitimate patterns to be flagged**:
her DI factory and shared schema module were both called god modules. Here the equivalents
are `src/types.ts` (fan-in 29, deliberately the single home for shared types) and
`TaskMarker` as the mandated funnel for all marker access. Both are architecture, not debt,
and the review needs to be told so — otherwise, as she notes, they "create even more noise."

## 11. Sequencing

**[revised] P6 moves from second-to-last to second.** §3.1 is why: real coverage data
reordered the entire risk picture and exposed a critical untested function that nothing else
surfaced. It is also nearly free — the coverage data already exists.

| # | Change | Effort | Closes | Status |
|---|---|---|---|---|
| P2 | Oxlint + the four AI-failure-mode rules + fix the findings | ~1h | G2 | **done** (v0.16.2) |
| P6a | Istanbul coverage for CRAP, ratchet the floor | ~1h | — | **done** (v0.16.2) |
| P5a | LLM-shaped lint messages via `lint-guided.mjs` | ~1h | — | **done** (v0.16.2) |
| P1 | Agent hooks: Oxlint on `PostToolUse`, `fallow audit` + tests on `Stop` | ~1h | **G1** | open |
| P5b | LLM-shaped messages for the existing git hooks; advisory ledger | ~1h | — | open |
| P3 | Pinned Fallow + `.fallowrc.json` + baselines + CI step | ~2h | G3 | open |
| P4 | Boundary zones, after deciding the `utils/` question | ~2h | G4 | open |
| P6b | Stryker on `tasks.ts` / `projects.ts` / `autoMove.ts` + query script | ~3h | — | open |
| P7 | `modularity-review` skill, per release | ~2h | — | open |

**As-built notes for the completed rows.** The complexity and size rules are configured as
*warnings*, not errors: `src/` has substantial existing debt (seven functions over
complexity 15, eight over 80 lines) and making those errors would have failed the build on
day one — the trap §6 warns about. Oxlint exits 0 on warnings, so `npm run lint` gates on
correctness errors while the thresholds stay visible as the ratchet.

Oxlint's `suspicious` category was evaluated and **rejected**: it produced 49 `no-new`
findings on `new Notice(...)`, which is the standard Obsidian idiom, and
`no-underscore-dangle` directly contradicts the `_`-prefix convention used for deliberately
unused bindings. That is §1.7's feedback overload in concrete form — dropping the category
took the signal from 89 findings to 40, all of them meaningful.

`lint-guided.mjs` implements §1.2 by mapping rule codes to project-specific remedies over
Oxlint's JSON output. The `complexity` rule is the reason it exists: it ships with no `help`
text at all, and it is the rule Böckeler watched her agent evade.

Coverage keeps **v8 as the gate** (the existing thresholds are calibrated to it) and adds a
separate `test:crap` script emitting istanbul JSON purely for Fallow. The two providers
instrument differently — 92.06% under v8 versus 86.4% under istanbul — so sharing one
threshold set between them would have produced false failures.

Rewrite the existing hook messages for LLM consumption alongside P5 — "Error: planning
comments found in staged .ts files." becomes materially more useful with the remedy
attached. Ten minutes, and it is the article's most distinctive recommendation.

**CI** gains `npm run lint` and `npx fallow audit`. Keep `audit` (changed-files, new-only)
in PR CI rather than a full `fallow` run, so the inherited baseline never blocks a PR that
did not cause it. Per Böckeler, CI re-runs the *same* sensors on clean infrastructure — it
is confirmation, not a different checklist.

### First payload of real fixes

Delivered in v0.16.2:

1. ✅ Removed the unused `TFile` import from `migrateTask.ts`, `pullTaskUp.ts`,
   `pushTaskDown.ts`, `takeProjectTask.ts`, plus the dead `taskIndent` local and two
   redundant regex escapes.
2. ✅ Dropped `export` from `CollectorLineShape` (`src/utils/projects.ts`).
3. ✅ Added `@wdio/types` to `devDependencies` — it was type-imported by
   `tests/e2e/wdio.conf.ts` and resolving only transitively.
4. ❌ **Not done:** moving `obsidian-daily-notes-interface` to `dependencies`. Reversed on
   inspection — see §3. Suppress the rule instead, when P3 lands.
5. ✅ **Tested `detectAutoMoveCandidate`** — the CRAP 132 / 0% covered function from §3.1.
   Rather than stand up a CM6 view, its signature now takes the three `@codemirror/state`
   values it actually reads (`ChangeSet`, new `Text`, old `Text`), so the transition rules
   are exercised from a plain `EditorState` transaction. This follows the precedent the file
   already set with `AutoMoveDoc` ("keeps the run testable without a CM6 view"). `src/events`
   coverage went 74.55% → 85.03%, and the function is no longer the top CRAP risk.

   The new tests were **hand-mutation-tested** before being accepted — dropping the
   already-in-that-state guard, reporting started tasks as completed, and removing the
   early-return short circuit each killed one or more tests. This is §9's technique applied
   manually, and it is why the suite is trusted rather than merely green.

Two follow-ups worth issues, both unblocked by the above:

6. The shared transfer engine: 4.8% duplication across `migrateTask`/`pullTaskUp`/
   `pushTaskDown`, also open in the 2026-06-10 review.
7. `findTopLevelTasksInRange` (cognitive 32) in `src/utils/tasks.ts`. Now the joint-top
   complexity finding alongside `createPeriodicNoteFromTemplate` (CRAP 106.4, 40% tested),
   which the coverage-weighted run promotes above it on risk.
6. File an issue for the shared transfer engine, citing 4.8% duplication across
   `migrateTask`/`pullTaskUp`/`pushTaskDown` and the 2026-06-10 review's open item.
7. File an issue for `findTopLevelTasksInRange` (cognitive 32) in `src/utils/tasks.ts`.

## 12. What not to do

- **Do not gate on the 16.2% whole-repo duplication.** It is the test-helper factory
  pattern `tests/CLAUDE.md` prescribes. Baseline it.
- **Do not run every sensor on every edit.** Böckeler's warning about "a spiral of
  over-engineered refactorings" is the reason for §4's split by blast radius.
- **Watch for rule conflicts.** Her only observed instance was `max-lines` pushing
  complexity out of functions and into property chains. The live risk here is that both
  Fallow and `max-lines` will push to split `tasks.ts` (637 lines) and `indent.ts`; if the
  result is more parameters threaded through more call sites, the sensor has made the
  codebase worse. `max-params` is the counterweight — keep both on.
- **Do not add ESLint alongside Oxlint** without a specific rule that needs it. Two linters
  disagreeing about one finding trains agents to ignore both.
- **Do not enable `--type-aware` in the agent loop.** Slower, needs a sidecar; reserve it
  for deliberate refactors (`fallow dead-code --type-aware --symbol-impact`).
- **Do not treat Fallow's coupling data as agent feedback.** §1.5: it is review triage.
- **Do not let sensors erode the core design principle.** `CLAUDE.md` is explicit that the
  markdown file *is* the state. No sensor here should ever motivate a metadata, query, or
  caching layer to make itself easier to compute.
