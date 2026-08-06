---
name: modularity-review
description: Use before cutting a release, or when changes are starting to touch more files than they should — reviews the whole codebase's design for coupling and semantic duplication that the linter, Fallow and the test suite cannot see, grounded in Fallow's metrics rather than impressions
---

# Modularity Review

## Overview

A design review of the **whole codebase**, run on a cadence rather than per change.

Every other sensor in this repo is computational: `npm run lint` judges files and
functions, `npm run audit:code` finds exact clones and dead code, the suite catches
regressions. None of them can see the failure this review exists to catch — code that is
*semantically* duplicated, misplaced, or coupled in a way no string comparison detects.

The canonical example: a fourth transfer command that reimplements collector decomposition
instead of reusing `decomposeCollectorForTransfer`. Fallow's clone detection sees two
different-looking functions. A reviewer sees one idea implemented twice.

**Announce at start:** "I'm using the modularity-review skill."

**Core principle:** ground every claim in tool output or a named file and line. An
impression is not a finding.

## When to run it

- Before a release (pairs naturally with `cut-release`).
- When a small change starts touching a surprising number of files — the earliest
  reliable sign that internal quality is slipping.
- After a run of feature work done largely by agents, which is when semantic duplication
  accumulates: agents reliably copy rather than refactor on the third or fourth repetition.

Not per commit. `fallow audit` already gates each change; this looks for drift that no
single change introduced.

## The Process

### Step 1: Gather evidence first

Run these and keep the output — the review is grounded in it, not in browsing:

```bash
npm run health                    # hotspots: churn x complexity, fan-in, refactoring targets
npm run test:crap && npx fallow health --hotspots   # complexity weighted by real coverage
npx fallow dupes                  # exact clones, for contrast with what you find
npm run test:mutation             # optional, slow: where assertions are weakest
node mutation-report.mjs summary  # if a report exists
```

`fallow health` reports fan-in and churn per file. High fan-in plus high churn is where a
design mistake costs the most, so start there rather than at the top of the file list.

### Step 2: Read the code the evidence points at

Read the actual files. Grounding the analysis in metrics raises confidence and costs fewer
tokens than scanning the codebase, but the metrics alone are too shallow to judge design —
they cannot tell an appropriate hub from an accidental one.

### Step 3: Look for these specific failures

Each has been observed in real agent-built codebases:

1. **Semantic duplication.** The same idea implemented twice in different shapes. Check the
   transfer commands against each other (`migrateTask`, `pullTaskUp`, `pushTaskDown`,
   `takeProjectTask`) — they share collector decomposition, child selection and notice
   formatting, and are the most likely place for a fifth variant to appear.
2. **Repeated parameter chains.** The same arguments threaded through every level instead
   of wrapped in one object. `max-params` warnings are the mechanical hint; the design
   question is whether a concept is missing a name.
3. **Responsibilities in the wrong place.** Logic that works but sits somewhere no one
   would look for it, so the next change misses it. Check `src/adapters/` especially: it is
   allowed to call Obsidian, which makes it a magnet for domain logic that belongs in
   `src/utils/`.
4. **Inconsistent approaches to one job.** Two commands solving the same sub-problem
   differently — divergent error handling, or one reaching for the vault directly where
   others go through `commandSetup`.
5. **Guides that have drifted from the code.** `CLAUDE.md` and `docs/key-insights.md`
   describe invariants that are only partly enforced. Anything false is worse than absent,
   because agents trust it.

### Step 4: Write the report

Save to `docs/plans/YYYY-MM-DD-modularity-review.md`:

- **Context** — what was analysed, at which commit.
- **Summary** — the two or three systemic issues, if any.
- **Findings from the tools** — hotspots, cycles, high fan-in, weak mutation scores.
- **Deep dive per issue** — what it is; why it hurts (a concrete future change made
  expensive); two or more options; why the recommended one is better.
- **Explicitly not problems** — see below.

Then offer to file issues. Do not start refactoring: this review's output is a plan, and
acting on it mid-review loses the overview that made it useful.

### Step 5: Run it twice when it matters

A second pass without the first one's context reliably surfaces something the first missed.
For a pre-release review, do both.

## Legitimate patterns — do not report these as defects

Expect high-coupling hubs to look like god modules. In this repo they are deliberate:

- **`src/types.ts`** has the highest fan-in in the codebase *by design* — `CLAUDE.md`
  requires all shared types to live there.
- **`TaskMarker`** is the mandated funnel for every task-state transition. Everything
  touching markers depends on it; that is the invariant working.
- **`src/utils/tasks.ts`** is broad because it is the shared vocabulary of the transfer
  commands. Its size is worth questioning; its centrality is not.
- **`tests/helpers/*PluginTestHelper.ts`** duplicate each other heavily and
  `tests/CLAUDE.md` prescribes that. One factory per command is the point.

If the review's top finding is one of these, it has misfired — say so and look again.

## What this review must not recommend

- Anything requiring Obsidian or the plugin to interpret meaning correctly. The markdown
  file *is* the state (`CLAUDE.md`, Core Design Principle). No metadata, query or caching
  layer, however much it would tidy the design.
- Relaxing a threshold or a coverage floor. Those only tighten.
- Splitting a file merely because it is long. A split that threads more parameters through
  more call sites has made the codebase worse; `max-params` exists as that counterweight.
