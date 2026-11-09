# Software Factory 3: Implementation to Preview

## Goal

The user can request and test a small, well-specified change entirely through GitHub. This completes the first usable delivery loop before investing in automated requirements refinement.

## Scope

- Start from an issue containing desired behavior, representative Markdown input/output, and exclusions supplied by the user.
- Have the implementer read the relevant repository guidance, architecture, and tests; identify existing extension points before editing.
- Implement on an issue branch and open or update a linked draft PR.
- Write behavior tests and run the segment 1 gates. Repair failures within the controller's bounded attempt budget; never weaken gates to pass.
- Publish an eligible candidate and post a concise preview report with its SHA, installation/return instructions, what changed, what ran, and what needs manual testing.
- Supply starting Markdown or a disposable fixture vault so manual checks are quick to reproduce.
- Route feedback to a new attempt on the same issue. Retain candidate history and make the current candidate obvious.

## Implementation Order

Connect one prepared issue to branch creation and implementation, then to the existing candidate pipeline. Add feedback-driven revision after the first preview works. Keep merging manual during these trials.

The report should distinguish automated passes, manual checks needed, and behavior not tested. Screenshots or recordings are useful where available, but must not substitute for actual assertions.

## Completion Criteria

- A small visible behavior change reaches an installable preview without local intervention.
- The user can report a failure in the issue and receive a revised preview.
- The report is tied to executed checks and the exact candidate, not an agent's unsupported claim of verification.
- A failed run posts the concrete obstacle and preserves useful work.
- Accepted behavior can be merged manually through the existing process.

## Deferred

Automatic refinement of rough requests, a separate verification agent, post-acceptance cleanup, and automatic merging. These must not block proving the first issue-to-preview loop.

## Sequence

Status: coding executor trial implemented; issue-to-PR and preview integration pending. Segment 3 of 7.

1. [CI and releases](2026-11-06-factory-01-ci-and-releases.md)
2. [Issue controller](2026-11-06-factory-02-issue-controller.md)
3. [Implementation and preview](2026-11-06-factory-03-implementation-and-preview.md) — this segment
4. [Requirements refinement](2026-11-06-factory-04-requirements-refinement.md)
5. [Verification and cleanup](2026-11-06-factory-05-verification-and-cleanup.md)
6. [Merge and recovery](2026-11-06-factory-06-merge-and-recovery.md)
7. [Cost reporting](2026-11-09-factory-07-cost-reporting.md)

Depends on segment 2; build on its completed path rather than introducing a parallel workflow. The first implementation batch is segments 1–3. Use that working loop to develop the later segments, retaining explicit review of factory-control changes.

## Model routing

Use the configured implementer (initially MiniMax M3.1 Flash). After an initial
attempt and two failed repair cycles, escalate to the configured stronger coder
(initially Claude Opus 5.5), passing the agreement, diff, failed approaches and
check output. Escalate earlier when an architectural problem is identified.
Unresolved product requirements return to the planner. Keep this repair budget
separate from controller/infrastructure retries. Activate the corresponding role
variables in the workflow when implementing this segment.

## Agent environment

Reuse Flue's standard local environment and coding tools for implementation and
escalation. Escalation changes the model and receives the existing workspace and
failure evidence. The planner exposes only Flue's read/search tools. Keep GitHub
authorization, branch publication, candidate selection and merge decisions in the
controller. Avoid custom file, edit, shell or context-management implementations.
The local adapter is not an isolation boundary: use the Actions job/container for
execution isolation and keep publishing credentials outside the coding agent.

## Runtime reuse hint

Use Flue's CLI result envelope for outcomes and its existing compaction within coding runs. Evaluate conversation continuation and model changes for escalation within one run; cross-run continuation requires durable storage. Configure reasoning effort alongside model roles when useful.
