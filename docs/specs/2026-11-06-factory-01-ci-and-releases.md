# Software Factory 1: CI and Candidate Releases

## Goal

A branch can produce a checked, deliberately installable Bullet Flow preview without a Claude Code session. This is the foundation for the issue-driven factory: one user, with specification and QA as the bottlenecks.

## Scope

- Make required quality checks explicit commands and CI gates, independent of Claude session hooks. Reuse existing lint, coverage, build, and changed-code audit behavior; preserve the distinction between blocking errors and advisory debt.
- Separate candidate publication from stable publication. A candidate must pass the required gates before being offered for testing.
- Associate each candidate with its source SHA, check results, release assets, and installation instructions. Publish immutable candidates rather than overwriting an existing build.
- Establish deliberate candidate selection and return-to-stable through BRAT or another minimal installation path. Verify BRAT's actual version-selection and downgrade behavior before choosing the mechanism.
- Keep ordinary stable installations from silently following unrelated development candidates.
- Preserve the existing release/versioning conventions for stable releases.

## Implementation Order

First expose the checks outside session hooks. Then gate candidate packaging on those checks. Finally prove exact-build installation and return-to-stable on the devices used for testing.

The existing CI and release workflows are starting points, not separate definitions of quality. Share the gate implementation where practical.

## Completion Criteria

- A failing required check prevents candidate publication.
- An eligible branch produces the plugin assets with an unambiguous build identity.
- The user can install that exact candidate and return to a known stable version.
- A subsequent candidate does not unexpectedly replace the one under evaluation.
- No Claude Code session or local build is required for this path.

## Deferred

Issue orchestration, automated specification, independent verification, and automatic merging. Existing quality gates apply immediately; richer verification arrives in segment 5.

## Decisions to Resolve During Implementation

The candidate distribution mechanism and release-version scheme, based on a practical BRAT trial. Do not assume that marking a GitHub release as a prerelease provides sufficient channel isolation.

## Sequence

Status: implemented in PR #42; hosted CI and browser Extract log trial passed. Segment 1 of 8.

1. [CI and releases](2026-11-06-factory-01-ci-and-releases.md) — this segment
2. [Issue controller](2026-11-06-factory-02-issue-controller.md)
3. [Implementation and preview](2026-11-06-factory-03-implementation-and-preview.md)
4. [Requirements refinement](2026-11-06-factory-04-requirements-refinement.md)
5. [Verification and cleanup](2026-11-06-factory-05-verification-and-cleanup.md)
6. [Merge and recovery](2026-11-06-factory-06-merge-and-recovery.md)
7. [Cost reporting](2026-11-09-factory-07-cost-reporting.md)
8. [Self-improvement](2026-11-09-factory-08-self-improvement.md)

No dependency on later segments. The first implementation batch is segments 1–3. Use that working loop to develop the later segments, retaining explicit review of factory-control changes.

## Implementation Decision

Candidates use immutable Actions artifacts with exact commit/run/attempt identity,
check evidence, asset hashes, and manual install/rollback instructions. They do not
enter GitHub Releases or BRAT's latest selection. BRAT's documented inclusion of
prereleases makes same-repository prereleases unsuitable for channel isolation.
See [the operational guide](../AUTO-DEPLOY.md) for the workflow and the outstanding
desktop/mobile installation trial. Existing development releases are retained;
users may need to freeze their stable BRAT installation to an explicit stable tag.

### Browser preview delivery

The normal human trial uses a Codespace on the candidate branch, with real
Obsidian over a private forwarded desktop port and a synthetic vault. First launch
selects the successful push-CI artifact for the checked-out SHA and verifies its
identity and hashes. Resumes retain that candidate; resetting restores only the
test vault. Manual installation remains an optional device-compatibility path.
See [preview operations](../PREVIEW.md). Hosted provisioning, browser access and
an Extract log trial are confirmed. Reset and optional device trials remain.
