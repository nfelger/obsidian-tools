# Software Factory 7: Turn Costs and Cost per Accepted Change

## Goal

Show what each factory turn cost and the total after merge. Issue comments are
the only persistent cost record; no separate ledger, state branch fields,
database, or usage artifacts.

## Implementation

- At the end of each controller-dispatched turn, sum its model calls and post a
  compact issue comment: stage, model(s), cost in USD, and workflow-run link.
  Include failed attempts where usage is available. Example:
  `Implementation · MiniMax M3.1 Flash · $0.04 · Total so far: $0.19 · Run …`
- Give the comment a stable hidden marker based on the run ID and attempt.
  Update that comment if publication is retried; do not add the same cost twice.
  Read the bot's marked comments to calculate cumulative cost.
- Use OpenRouter-reported cost when available. Clearly label estimates and
  unknown/incomplete costs; missing usage is not zero. Temporary in-run request
  IDs and usage are fine, but do not persist a second copy of the cost record.
- On merge, sum those comments and publish one summary: total model cost and
  number of turns, linked to the merged PR. Mark the total incomplete if any
  turn has missing usage. The issue history already supplies the detail.
- Reporting is deterministic code. No model calls to calculate or explain costs.

## Checks

A turn with several model calls includes them all. Publishing twice does not
change the total. Failed-turn costs count. The merge total matches the recorded
turns, and missing usage remains visible.

## Limits

This is useful feedback, not billing-grade accounting. No background cost
reconciliation, detailed token reports, dashboards, shared-cost allocation, or
human-time tracking. Abruptly interrupted runs can leave costs unknown; surface
that limitation rather than building a recovery system. Existing workflow state
is still used to run the factory, but gains no cost ledger. Earlier turns without
cost reporting cannot be retrospectively treated as free.

## Sequence

Status: proposed. Segment 7 of 7.

1. [CI and releases](2026-11-06-factory-01-ci-and-releases.md)
2. [Issue controller](2026-11-06-factory-02-issue-controller.md)
3. [Implementation and preview](2026-11-06-factory-03-implementation-and-preview.md)
4. [Requirements refinement](2026-11-06-factory-04-requirements-refinement.md)
5. [Verification and cleanup](2026-11-06-factory-05-verification-and-cleanup.md)
6. [Merge and recovery](2026-11-06-factory-06-merge-and-recovery.md)
7. [Cost reporting](2026-11-09-factory-07-cost-reporting.md) — this segment

Build on the controller and merge lifecycle from segments 2 and 6.

## Runtime reuse hint

Use Flue's per-call usage events to aggregate each turn in memory and publish its
cost comment. Runtime catalog costs are estimates; prefer OpenRouter actual costs
when available. Count one event level to avoid double counting roll-ups. This adds
no separate persistent ledger or background reconciliation.
