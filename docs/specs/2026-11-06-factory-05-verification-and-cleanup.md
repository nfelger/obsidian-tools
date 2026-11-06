# Software Factory 5: Independent Verification and Bounded Cleanup

## Goal

The final candidate has evidence beyond the implementer's assertions, and useful behavior is followed by scoped architecture cleanup without silently invalidating the user's acceptance.

## Scope

- Give an independent verifier the current behavior agreement and repository constraints in a fresh context. It first looks for missing or contradictory scenarios, then evaluates implementation and executed evidence.
- Connect acceptance IDs to Markdown-first fixtures: starting files, action, expected files. Render those results as a human-skimmable report.
- Run relevant real-Obsidian E2E checks for editor and adapter interactions. Clearly identify mobile or interaction behavior that still needs manual testing.
- Use mutation testing selectively where changed transformation logic needs stronger assertions; avoid turning every change into a whole-repository quality campaign.
- Emphasize content preservation, untouched regions, failed target writes, and unintended duplication on retries where repeat safety is expected.
- After user acceptance, perform bounded cleanup of the changed code: names, introduced duplication, responsibilities, and established boundaries. Reuse existing maintainability guidance. No cleanup is a valid outcome.
- Put broad architectural work in separate issues rather than expanding this change.

## Implementation Order

First establish verifier reports and acceptance-to-test mapping. Then integrate relevant E2E evidence. Finally add post-acceptance cleanup and final revalidation.

Any cleanup produces a new candidate SHA and requires renewed automated evidence. Behavior changes, uncertain equivalence, or changes to file-writing/editor integration return to preview. A low-risk behavior-preserving cleanup may proceed under an explicit standing policy, with its delta and evidence recorded; it must not be described as the exact build the user tried.

## Completion Criteria

- A deliberately incorrect implementation is rejected against the agreement.
- Reports distinguish passed, failed, manual, and untested cases.
- Cleanup preserves scope and never relaxes existing quality limits.
- Final checks run on the post-cleanup candidate.
- A risky or behavioral cleanup returns to the user rather than inheriting stale acceptance.

## Deferred

Unbounded architecture improvement, unrelated debt removal, and mandatory full mutation runs. Segment 6 enforces final merge eligibility.

## Sequence

Status: proposed. Segment 5 of 6.

1. [CI and releases](2026-11-06-factory-01-ci-and-releases.md)
2. [Issue controller](2026-11-06-factory-02-issue-controller.md)
3. [Implementation and preview](2026-11-06-factory-03-implementation-and-preview.md)
4. [Requirements refinement](2026-11-06-factory-04-requirements-refinement.md)
5. [Verification and cleanup](2026-11-06-factory-05-verification-and-cleanup.md) — this segment
6. [Merge and recovery](2026-11-06-factory-06-merge-and-recovery.md)

Depends on segment 4; build on its completed path rather than introducing a parallel workflow. The first implementation batch is segments 1–3. Use that working loop to develop the later segments, retaining explicit review of factory-control changes.
