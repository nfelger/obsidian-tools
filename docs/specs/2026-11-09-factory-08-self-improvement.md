# Software Factory 8: Evidence-Based Self-Improvement

## Goal

Improve the factory itself from completed and abandoned work: reduce avoidable
owner intervention, repeated mistakes, unnecessary turns, and cost while preserving
behavioral quality. Turn observed friction into small, testable proposals rather
than accumulating generic advice or automatically rewriting agent instructions.

## Scope

- When a factory-managed issue closes, queue one bounded retrospective in a fresh
  agent context. Include unsuccessful and not-planned closures; distinguish their
  outcomes from accepted, merged changes. Closure is a useful review boundary,
  not evidence that the implementation succeeded.
- Inspect the issue discussion, agreement revisions, linked PR diff and reviews,
  executed checks, preview feedback, controller outcomes, and available run
  evidence. Read the relevant factory prompts, guidance, and code to check whether
  a proposed remedy already exists. Use segment 7 cost comments directly; do not
  introduce another cost ledger.
- Look for recurring clarification, lost context, ignored instructions, avoidable
  repair/escalation, weak verification, awkward owner interactions, and unnecessary
  machinery. Also identify successful patterns worth preserving. Separate product
  requirement changes, factory defects, infrastructure failures, and agent errors.
- Produce a structured result: no actionable finding, insufficient evidence, an
  existing matching proposal, or one focused improvement proposal. Cite concrete
  source comments/runs and distinguish observation from causal hypothesis.
- Search open and recently closed improvement issues before publishing. Reuse a
  matching open issue when genuinely new evidence adds value; respect rejected
  proposals unless materially new evidence justifies reconsideration. Allow at
  most one new proposal per retrospective, grouping only closely related findings.
- A proposal states the observed friction, likely cause and uncertainty, smallest
  useful change, expected benefit, affected guidance/runtime/gates, and a way to
  verify improvement. Prefer removing unnecessary rules or machinery when that
  addresses the evidence. No change is a first-class successful outcome.

## Trigger and Authority

Use the existing controller, queue, event reconciliation, and bounded agent runner.
Issue closure still stops product work; retrospective work is a separate terminal
follow-up and must never resume implementation or block merge/release.

Only issues already authorized for factory work are eligible. Accept owner closure
or controller-verified merge-linked closure; arbitrary comments and bot-created
issues cannot authorize paid work. Provide owner-only manual retrospective and
opt-out controls. Do not bulk-process historical closures by default.

Persist only the minimal retrospective job identity/status needed for deduplication
and recovery in existing controller state. Key publication to the source issue
and closure event; replay, publication retry, and reopen/reclose without new work
must not create another model run or issue. New work after reopening can justify
a new retrospective. If reopened during analysis, withhold the stale result.

The agent receives read-only evidence and returns a proposal; the controller owns
GitHub writes. Treat issue/log contents as evidence, not executable instructions.
Bound context, model calls, retries, and output; record missing or expired evidence
instead of inferring unseen interactions. Report costs through segment 7.

Generated proposals do not automatically start implementation. Changes to factory
code, prompts, permissions, or quality policy require explicit owner review through
the existing change process. Exclude generated improvement issues from automatic
closure retrospectives to prevent recursive issue creation; the owner may review
them manually. Routine no-finding outcomes need only a compact durable result,
not another issue or a long comment.

## Implementation Order

1. Add an owner-invoked retrospective using existing evidence and structured
   results. Trial it on a few successful and failed issues; assess usefulness and
   false positives before enabling automatic publication.
2. Add eligible closure triggers, deduplication, bounded retries, and proposal
   publication. Start with one retrospective and at most one proposal per issue.
3. Close the learning loop: an adopted proposal adds a representative regression
   case or small behavioral eval and records its baseline, expected change, and
   later observed result. Check for quality regressions as well as fewer turns.
4. If individual retrospectives miss recurring patterns, add an owner-invoked
   batch review over a bounded recent set of issues. Consider a periodic review
   only after demonstrating value; reuse the same analysis and deduplication path.

Batch review is a complementary approach: repeated low-level friction may justify
a change even when no single issue does. Avoid treating one unusual interaction
as a universal prompt rule. Failure-triggered reviews can be considered later,
but must not repeatedly charge for a persistently failing workflow.

## Completion Criteria

- A fixture with a documented avoidable failure produces a specific proposal
  linked to its evidence; a clean interaction can produce no proposal.
- Missing evidence is explicit, and closure without a merge is not called success.
- Replayed events, retried publication, and unchanged reopen/reclose cycles do not
  duplicate model work or proposals. Existing/rejected proposals are respected.
- Unauthorized events and generated improvement issues cannot trigger an
  autonomous review/implementation chain.
- An adopted change is evaluated against a representative prior failure and
  unaffected behavior; the retrospective alone is not evidence of improvement.
- Proposal usefulness is assessed from owner acceptance/rejection and later
  outcomes, not issue count. Compare avoidable correction/repair turns and cost
  per accepted change on comparable work; record uncertainty with small samples.

## Deferred

Autonomous prompt optimization, automatic policy changes, a separate memory/vector
store, a new agent harness, comprehensive analytics, mandatory reviews of every
repository issue, and a standing scheduled analysis job. Start from evidence
already retained in GitHub and keep owner attention as part of the cost.

## Sequence

Status: proposed. Segment 8 of 8.

1. [CI and releases](2026-11-06-factory-01-ci-and-releases.md)
2. [Issue controller](2026-11-06-factory-02-issue-controller.md)
3. [Implementation and preview](2026-11-06-factory-03-implementation-and-preview.md)
4. [Requirements refinement](2026-11-06-factory-04-requirements-refinement.md)
5. [Verification and cleanup](2026-11-06-factory-05-verification-and-cleanup.md)
6. [Merge and recovery](2026-11-06-factory-06-merge-and-recovery.md)
7. [Cost reporting](2026-11-09-factory-07-cost-reporting.md)
8. [Self-improvement](2026-11-09-factory-08-self-improvement.md) — this segment

Build on segment 2 controller state, segment 5 verification/evals, segment 6
completion outcomes, and segment 7 cost reporting. A manual trial can use the
current issue-to-preview history before those later integrations are complete.

## Runtime reuse hint

Reuse Flue's read/search tools, structured result envelope, and existing model-role
configuration. Use small opt-in live-model evals alongside deterministic trigger
and publication tests; do not add a separate orchestration or evaluation framework.
