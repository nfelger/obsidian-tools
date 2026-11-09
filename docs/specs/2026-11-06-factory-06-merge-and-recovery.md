# Software Factory 6: Merge, Release, and Recovery

## Goal

Complete accepted changes and handle ordinary failures through GitHub, without requiring the user to rescue a Claude Code session.

## Scope

- Add an explicit acceptance command tied to a candidate SHA and agreement revision. A model's interpretation of conversational approval is not sufficient.
- Have the controller check current authorization, agreement, candidate, independent verification, cleanup disposition, and required CI results before merging.
- Reconcile changes to the base branch before merge. Revalidate the final integration candidate; require another preview when behavior or risk changed.
- Perform stable versioning and changelog updates under the existing release conventions, check the resulting candidate, and publish the corresponding stable assets.
- Expose issue commands for retry, clarification, rebase, stop, status/blocker explanation, and return-to-stable guidance.
- Preserve branches and evidence on failure. Explain the obstacle, available choices, and whether user input or an infrastructure fix is needed.
- Make merge and publication retries idempotent. A publishing failure after a successful merge retries publication rather than repeating implementation or merging again.
- Keep controller, permission, and quality-policy changes subject to explicit owner review rather than automatic self-approval.

## Implementation Order

Begin with a merge-eligibility report while the user still merges manually. Exercise stale acceptance and changed-base cases. Then enable automatic merge/release for eligible changes and complete the recovery commands.

Acceptance of behavior may authorize bounded cleanup under the segment 5 policy, but the controller must record the tested and final SHAs separately. If it cannot establish eligibility, it stops with an explanation.

## Completion Criteria

- An accepted, fully checked change merges and produces a stable release without a local session.
- Stale acceptance, failed checks, unresolved verifier findings, or superseded work block completion.
- Release failure can be retried without duplicate releases or commits.
- The user can stop or recover an ordinary failed attempt through the issue.
- Returning to a previous plugin version is distinguished from restoring note data; a binary rollback does not undo text transformations.

## Deferred

Guaranteed autonomous recovery from every infrastructure failure. Success is reduced user attention and fewer local rescues, not concealing blockers.

## Sequence

Status: proposed. Segment 6 of 7.

1. [CI and releases](2026-11-06-factory-01-ci-and-releases.md)
2. [Issue controller](2026-11-06-factory-02-issue-controller.md)
3. [Implementation and preview](2026-11-06-factory-03-implementation-and-preview.md)
4. [Requirements refinement](2026-11-06-factory-04-requirements-refinement.md)
5. [Verification and cleanup](2026-11-06-factory-05-verification-and-cleanup.md)
6. [Merge and recovery](2026-11-06-factory-06-merge-and-recovery.md) — this segment
7. [Cost reporting](2026-11-09-factory-07-cost-reporting.md)

Depends on segment 5; build on its completed path rather than introducing a parallel workflow. The first implementation batch is segments 1–3. Use that working loop to develop the later segments, retaining explicit review of factory-control changes.
