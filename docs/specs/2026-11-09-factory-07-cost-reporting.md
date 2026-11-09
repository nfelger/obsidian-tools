# Software Factory 7: Turn Costs and Cost per Accepted Change

## Goal

Show the model cost of each factory turn and the total cost of delivering a merged
change. Compare models by cost per accepted change, including repair loops and
failed attempts, rather than token prices alone. No manual time tracking.

## Scope

- Define a turn as one controller-dispatched agent stage or user-feedback cycle.
  A turn can contain multiple model requests, tool calls, or delegated agents;
  sum all attributable requests rather than reporting only the final completion.
- Capture provider request/generation ID, issue, agreement revision, stage,
  attempt, turn ID, candidate SHA when available, requested and actual model,
  routed provider, input/output tokens, cached tokens, reasoning tokens when
  exposed, and provider-reported cost in USD. Do not persist secrets or prompts
  in the cost ledger. Missing optional token details remain unknown.
- Prefer OpenRouter's reported actual cost, including its cache/routing treatment.
  Never add reasoning tokens twice when they are already included in output.
  Do not multiply token counts by today's catalogue prices and call that actual.
- Persist usage independently of ephemeral runner output. Deduplicate by provider
  request ID across webhook replay, reconciliation, reruns and report publication.
  Attribute requests from failed, cancelled, superseded and retried attempts too.
- After each turn, append a compact cost line to its issue report: turn cost,
  cumulative issue cost, stage/model, and whether accounting is complete.
  Keep detailed usage in a linked report so the issue remains skimmable.
- On merge, publish a final summary on the issue/PR: total attributable model cost,
  turns, failed/retried attempts, and breakdown by stage and model. Link the merged
  SHA and accepted agreement. Include refinement, implementation, verification,
  cleanup and repair costs, not just the final successful attempt.
- Delayed usage is pending, never zero. Reconcile missing usage after failure or
  merge; update the same report idempotently. Mark unrecoverable gaps explicitly.
  Accounting failures must not launch more model work to reconstruct a report.
- Keep a stopped/abandoned issue's spending visible, without counting it as an
  accepted change. Shared work must have an explicit allocation and no double count.

## Implementation Order

Instrument the shared model-call boundary and establish durable request identity.
Then add per-turn reporting and delayed-usage reconciliation. Finally hook merge
completion into a cumulative report and compare representative accepted changes
under different task/model assignments. Reporting is deterministic controller work.

Owner feedback leads to additional turns and therefore additional recorded costs;
no timer, manual effort field or monetary valuation of the user's time is required.
Turn counts are useful context, not a claim to measure all human effort.

## Completion Criteria

- A multi-request turn includes every request exactly once, including tool loops.
- Replaying a run or final report does not duplicate charges.
- Failed, cancelled and superseded work appears in the issue's cumulative total.
- Late usage updates pending totals; missing usage is distinguishable from free work.
- A merged change receives a total matching its deduplicated usage ledger, with
  breakdowns and the merge identity. Later accounting repair updates that report.
- Two model configurations can be compared by cost per accepted change and turns
  on comparable tasks, without manual time tracking.

## Deferred

GitHub Actions/Codespaces infrastructure billing, subscriptions, taxes, prepaid
credit-purchase fees and human-time costing. Report model inference costs clearly;
these are not a complete invoice or total cost of ownership. Automated model routing
based on cost reports follows evidence from actual changes.

## Sequence

Status: proposed. Segment 7 of 7.

1. [CI and releases](2026-11-06-factory-01-ci-and-releases.md)
2. [Issue controller](2026-11-06-factory-02-issue-controller.md)
3. [Implementation and preview](2026-11-06-factory-03-implementation-and-preview.md)
4. [Requirements refinement](2026-11-06-factory-04-requirements-refinement.md)
5. [Verification and cleanup](2026-11-06-factory-05-verification-and-cleanup.md)
6. [Merge and recovery](2026-11-06-factory-06-merge-and-recovery.md)
7. [Cost reporting](2026-11-09-factory-07-cost-reporting.md) — this segment

Build on the controller and merge lifecycle from segments 2 and 6. Preserve request
identities and usage when introducing earlier model-call boundaries so reporting
can be added without reconstructing costs from conversation text.
