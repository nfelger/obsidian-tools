# Software Factory 2: Issue-Driven Controller

## Goal

A GitHub issue can start work, pause, resume, and report failure reliably. GitHub is the user's interface; a small TypeScript controller owns workflow authority and invokes Flue for agent work.

## Scope

- Run from GitHub Actions, with a pinned compatible Flue and Node runtime. No always-on service is needed initially.
- Define explicit transitions for queued work, running work, waiting for input, preview ready, blocked, and stopped. Later segments extend this through verification and merge.
- Persist a versioned record of the issue, stage, specification revision, branch/head SHA, candidate, acceptance, processed events, and retry budget. Labels display state; they are not the sole source of truth.
- Reconstruct fresh agent contexts from the current agreement, repository guidance, and stage artifacts. Do not depend on local conversation storage surviving a runner.
- Allow commands from the repository owner; ignore bot feedback loops and unauthorized instructions.
- Serialize implementation work across the repository. Duplicate or delayed events must not create duplicate branches, previews, or transitions.
- Keep publishing and merging credentials outside the code-executing agent. Load trusted controller code independently of candidate changes.

## Implementation Order

Define the state record and transition rules, then wire GitHub events to a minimal Flue agent. Add pause/resume, bounded retries, and reconciliation before allowing that agent to modify product code.

Use explicit commands for consequential transitions. Natural-language discussion can inform agents but must not itself confer merge authorization.

## Completion Criteria

- A test issue starts a run and receives a concise status.
- Replaying an event has no duplicate effect.
- Work can pause and resume on a fresh runner.
- A stopped or superseded attempt cannot publish stale results.
- Exhausted retries leave a useful blocked state and preserve evidence.
- A second issue waits while another implementation is active.

## Deferred

Multiple concurrent candidates, persistent agent conversations, and a hosted orchestration service. Segment 6 adds the full user-facing recovery and merge commands.

## Sequence

Status: proposed. Segment 2 of 6.

1. [CI and releases](2026-11-06-factory-01-ci-and-releases.md)
2. [Issue controller](2026-11-06-factory-02-issue-controller.md) — this segment
3. [Implementation and preview](2026-11-06-factory-03-implementation-and-preview.md)
4. [Requirements refinement](2026-11-06-factory-04-requirements-refinement.md)
5. [Verification and cleanup](2026-11-06-factory-05-verification-and-cleanup.md)
6. [Merge and recovery](2026-11-06-factory-06-merge-and-recovery.md)

Depends on segment 1; build on its completed path rather than introducing a parallel workflow. The first implementation batch is segments 1–3. Use that working loop to develop the later segments, retaining explicit review of factory-control changes.
