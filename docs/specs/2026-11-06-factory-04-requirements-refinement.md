# Software Factory 4: Lightweight Requirements Refinement

## Goal

A rough intention or annoyance becomes enough specification to build and evaluate a preview, without requiring the user to write implementation-ready issues.

## Scope

- Maintain one bot-owned current-understanding comment containing the outcome, representative before/after examples, assumptions, exclusions, and genuinely blocking questions.
- Ground refinement in WORKFLOW.md, repository guidance, existing specs, relevant code, and tests. Existing implementation is evidence, not automatic authority over a requested behavior change.
- Ask about unresolved product choices; resolve ordinary implementation choices autonomously.
- Block on ambiguity that could lose content or materially change established behavior. Allow reversible, low-risk assumptions to proceed visibly into a preview.
- Assign stable IDs to acceptance examples so later tests and reports can refer to them.
- Version the agreement. When feedback changes requirements, show a short delta and mark affected candidate evidence or acceptance stale.
- Distinguish an implementation defect from a changed requirement so the agent does not rewrite the agreement merely to excuse a failing implementation.

## Implementation Order

Add refinement before the segment 3 implementer. First support a compact proposed agreement and blocking questions; then incorporate preview feedback into revisions. Persist the accepted behavior and useful fixtures in the repository when the change is completed.

Readiness means representative inputs, expected outcomes, and preservation requirements are clear. It does not require exhaustive edge-case enumeration or a large design document.

## Completion Criteria

- A rough issue produces a skimmable behavior agreement and can proceed to preview.
- The user is asked only questions that materially affect behavior or risk.
- Feedback updates the same current-understanding comment with a visible change summary.
- Implementation and preview reports identify their agreement revision.
- Requirements changes cannot leave an old acceptance appearing current.

## Deferred

A general product-management system, exhaustive specifications, and autonomous expansion of feature scope. Independent verification of acceptance coverage belongs to segment 5.

## Sequence

Status: proposed. Segment 4 of 6.

1. [CI and releases](2026-11-06-factory-01-ci-and-releases.md)
2. [Issue controller](2026-11-06-factory-02-issue-controller.md)
3. [Implementation and preview](2026-11-06-factory-03-implementation-and-preview.md)
4. [Requirements refinement](2026-11-06-factory-04-requirements-refinement.md) — this segment
5. [Verification and cleanup](2026-11-06-factory-05-verification-and-cleanup.md)
6. [Merge and recovery](2026-11-06-factory-06-merge-and-recovery.md)

Depends on segment 3; build on its completed path rather than introducing a parallel workflow. The first implementation batch is segments 1–3. Use that working loop to develop the later segments, retaining explicit review of factory-control changes.
