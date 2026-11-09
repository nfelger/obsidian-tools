# Software Factory 9: Automatic Startup on Issue Creation

## Goal

Start the factory workflow automatically when an issue is created, without
requiring an initial `/factory start` comment.

## Scope

- Issue creation queues the initial requirements/planning turn through the existing
  controller. Preserve owner authorization rules and ignore unauthorized triggers.
- Reuse event reconciliation, deduplication, and queueing so replayed events or an
  additional `/factory start` cannot create duplicate work.
- Automatic startup does not grant implementation or merge approval. Retain the
  explicit owner approval gates for those transitions.
- Reconcile this behavior with segment 8: automatically generated retrospective
  proposals must remain inert until explicit owner confirmation. Their creation
  must never launch implementation or a recursive chain of factory work.
- Update controller operations and the issue trial instructions when implemented.

## Completion Criteria

- Creating an eligible issue starts planning without `/factory start`.
- Duplicate delivery does not repeat the initial turn.
- Unauthorized issue creation cannot authorize model work.
- Retrospective-generated proposals still require explicit owner confirmation;
  implementation and merge retain their existing approval gates.

## Sequence

Status: proposed backlog item; current startup behavior remains unchanged.
Segment 9 of 10.

1. [CI and releases](2026-11-06-factory-01-ci-and-releases.md)
2. [Issue controller](2026-11-06-factory-02-issue-controller.md)
3. [Implementation and preview](2026-11-06-factory-03-implementation-and-preview.md)
4. [Requirements refinement](2026-11-06-factory-04-requirements-refinement.md)
5. [Verification and cleanup](2026-11-06-factory-05-verification-and-cleanup.md)
6. [Merge and recovery](2026-11-06-factory-06-merge-and-recovery.md)
7. [Cost reporting](2026-11-09-factory-07-cost-reporting.md)
8. [Self-improvement](2026-11-09-factory-08-self-improvement.md)
9. [Automatic startup](2026-11-09-factory-09-automatic-startup.md) — this segment
10. [Immediate turn responses](2026-11-09-factory-10-immediate-turn-responses.md)

Build on segment 2; coordinate the proposal exception with segment 8.
