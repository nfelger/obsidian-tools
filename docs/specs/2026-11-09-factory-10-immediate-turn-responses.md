# Software Factory 10: Immediate Turn Responses

## Goal

Make it immediately visible that the agent has received an owner comment and is
handling it, then leave a VERY CONCISE summary of the changes when finished.

## Scope

- Immediately acknowledge each accepted owner comment that triggers an agent turn
  with an issue comment, before model work starts. Show queued status when needed.
- When the turn finishes, update that same acknowledgement comment with a very
  concise summary of what changed. Aim for one short sentence or a few short
  bullets; link to detailed artifacts instead of repeating them.
- If the turn fails, is superseded, or makes no changes, update the same comment
  with that concise outcome so the acknowledgement never misleadingly implies
  ongoing work.
- Reuse controller event/turn identity for retries and deduplication; bot responses
  must not trigger another turn. Preserve batching of owner replies.
- Coordinate with the existing status comment and segment 7 cost reporting to
  avoid redundant commentary or a second persistent cost record.

## Completion Criteria

- An owner comment receives a visible acknowledgement before model work begins.
- Completion edits the same comment with a VERY CONCISE changes summary.
- Failed and superseded turns leave an accurate final outcome.
- Replayed events and publication retries create no duplicate acknowledgements,
  and bot comments cannot trigger response loops.

## Sequence

Status: proposed backlog item; current response behavior remains unchanged.
Segment 10 of 10.

1. [CI and releases](2026-11-06-factory-01-ci-and-releases.md)
2. [Issue controller](2026-11-06-factory-02-issue-controller.md)
3. [Implementation and preview](2026-11-06-factory-03-implementation-and-preview.md)
4. [Requirements refinement](2026-11-06-factory-04-requirements-refinement.md)
5. [Verification and cleanup](2026-11-06-factory-05-verification-and-cleanup.md)
6. [Merge and recovery](2026-11-06-factory-06-merge-and-recovery.md)
7. [Cost reporting](2026-11-09-factory-07-cost-reporting.md)
8. [Self-improvement](2026-11-09-factory-08-self-improvement.md)
9. [Automatic startup](2026-11-09-factory-09-automatic-startup.md)
10. [Immediate turn responses](2026-11-09-factory-10-immediate-turn-responses.md) — this segment

Build on segment 2 turn dispatch and status publication; coordinate with segment 7.
