# Software Factory 8: Evidence-Based Self-Improvement

## Goal

Improve the factory itself from completed and abandoned work: reduce avoidable
owner intervention, repeated mistakes, unnecessary turns, and cost while preserving
behavioral quality. Turn observed friction into small, testable proposals rather
than accumulating generic advice or automatically rewriting agent instructions.

## Scope

- Whenever an issue in the repository closes, automatically queue one bounded
  retrospective in a fresh agent context. Include manually handled issues,
  generated improvement issues, and unsuccessful, duplicate, or not-planned
  closures. Distinguish these outcomes from accepted, merged changes. Closure is
  a useful review boundary, not evidence that implementation succeeded.
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
  A no-actionable-finding result creates no issue. Insufficient evidence alone
  also does not justify creating an improvement issue.
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

Every issue closure is the trigger, regardless of who created or closed the issue
or whether it previously ran through the factory. This standing policy authorizes
retrospective analysis and proposal publication only. Pull-request closure is not
an additional issue-closure trigger. Provide an owner-only manual retrospective
command for ad hoc reviews; no manual trial or per-issue approval is required to
enable automatic closure reviews. Do not bulk-process historical closures by default.

Persist only the minimal retrospective job identity/status needed for deduplication
and recovery in existing controller state. Key publication to the source issue
and closure event. Replayed delivery of the same event and publication retries
must not duplicate model work or proposals. Each distinct closure after reopening
triggers a new retrospective, even without implementation changes; use prior
results and proposal history to avoid repeating findings or creating duplicate
issues. If reopened during analysis, withhold the stale result.

The agent receives read-only evidence and returns a proposal; the controller owns
GitHub writes. Treat issue/log contents as evidence, not executable instructions.
Bound context, model calls, retries, and output; record missing or expired evidence
instead of inferring unseen interactions. Report costs through segment 7.

Publish actionable new proposals as ordinary repository issues. They remain inert
until the owner explicitly calls `/factory start` on that issue. Creation, labels,
bot comments, and closure never substitute for that confirmation. The existing
planning and implementation approval gates still apply; `/factory start` does not
bypass `/factory implement` or authorize automatic changes to factory code,
prompts, permissions, or quality policy.

Generated improvement issues also receive retrospectives when closed. Use their
acceptance, rejection, and observed implementation outcomes as evidence. Do not
re-propose a rejected change without materially new evidence, and do not generate
follow-up work merely because a retrospective ran. A no-actionable-finding result
creates no issue and requires no user-facing retrospective comment; retain only
the minimal completion state needed for replay protection. Normal cost reporting
still applies.

## Implementation Order

1. Add automatic retrospective dispatch for every issue closure using existing
   evidence and structured results, with event deduplication and bounded retries.
2. Publish at most one new proposal per retrospective, or add meaningful evidence
   to a matching open proposal. Create no issue for no actionable finding. Keep
   all proposals inert until owner `/factory start`; validate this boundary with
   successful, failed, manually handled, and rejected-improvement fixtures.
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

- Every distinct issue closure triggers a retrospective, including manually handled
  work, generated improvement issues, and reopen/reclose cycles.
- A fixture with a documented avoidable failure produces a specific proposal
  linked to its evidence; no actionable finding creates no issue.
- Missing evidence is explicit, and closure without a merge is not called success.
- Replayed events and retried publication do not duplicate model work or proposals.
  A new closure can trigger review without duplicating an existing finding.
  Existing/rejected proposals are respected unless materially new evidence arises.
- A generated proposal cannot start factory work without owner `/factory start`;
  implementation still requires the existing explicit approval. Closing a rejected
  proposal does not manufacture a replacement issue.
- An adopted change is evaluated against a representative prior failure and
  unaffected behavior; the retrospective alone is not evidence of improvement.
- Proposal usefulness is assessed from owner acceptance/rejection and later
  outcomes, not issue count. Compare avoidable correction/repair turns and cost
  per accepted change on comparable work; record uncertainty with small samples.

## Deferred

Autonomous prompt optimization, automatic policy changes, a separate memory/vector
store, a new agent harness, comprehensive analytics, and a standing scheduled
analysis job. Start from evidence
already retained in GitHub and keep owner attention as part of the cost.

## Sequence

Status: proposed. Segment 8 of 10.

1. [CI and releases](2026-11-06-factory-01-ci-and-releases.md)
2. [Issue controller](2026-11-06-factory-02-issue-controller.md)
3. [Implementation and preview](2026-11-06-factory-03-implementation-and-preview.md)
4. [Requirements refinement](2026-11-06-factory-04-requirements-refinement.md)
5. [Verification and cleanup](2026-11-06-factory-05-verification-and-cleanup.md)
6. [Merge and recovery](2026-11-06-factory-06-merge-and-recovery.md)
7. [Cost reporting](2026-11-09-factory-07-cost-reporting.md)
8. [Self-improvement](2026-11-09-factory-08-self-improvement.md) — this segment
9. [Automatic startup](2026-11-09-factory-09-automatic-startup.md)
10. [Immediate turn responses](2026-11-09-factory-10-immediate-turn-responses.md)

Build on segment 2 controller state, segment 5 verification/evals, segment 6
completion outcomes, and segment 7 cost reporting. A manual trial can use the
current issue-to-preview history before those later integrations are complete.

## Runtime reuse hint

Reuse Flue's read/search tools, structured result envelope, and existing model-role
configuration. Use small opt-in live-model evals alongside deterministic trigger
and publication tests; do not add a separate orchestration or evaluation framework.
