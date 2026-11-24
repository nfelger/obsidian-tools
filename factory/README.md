# Issue controller

## Design guardrails

- Describe a change to vault behavior with a small synthetic vault, one user action and the expected Markdown in each affected note. Include surrounding text that must survive. For multi-note writes, cover an interrupted write, a retry and an edit made while the operation is in flight.
- Keep owner-approved examples available to an independent check. A coder’s completion report points to evidence. Verify the resulting files and reserve the Obsidian preview for judgments only the owner can make, such as whether capture still feels effortless.
- Identify the candidate by its commit and CI artifact when requesting acceptance. After a change to vault writes or editor integration, obtain fresh evidence and preview the revised candidate.
- Keep factory changes in separate owner-reviewed PRs. A product issue can surface a limitation without granting permission to change the controller, its checks or its publishing credentials. Improve the factory when a real cycle exposes lost work, a missed regression or avoidable owner intervention.

## Running the controller

Configure the `OPENROUTER_API_KEY` repository secret.
All model calls go through OpenRouter. Role defaults live in `models.ts`:

| Role | Default model | Actions variable |
| --- | --- | --- |
| Requirements and planning | `anthropic/claude-opus-5.5` | `PLANNER_MODEL` |
| Implementation | `minimax/minimax-m3.1-flash` | `IMPLEMENTER_MODEL` |
| Escalation and architecture review | `anthropic/claude-opus-5.5` | `ESCALATION_MODEL` |
| Bounded clerical tasks | `openai/gpt-6-luna` | `UTILITY_MODEL` |

Planning, implementation and escalation use the corresponding variables above.
Empty values use the defaults. The utility role is reserved for future work.
Comment `/factory start` on an issue as the repository owner. The issue body and
your preceding discussion comments form the requirements snapshot. The planner
returns a handoff and acceptance cases for your approval.

Answer planner questions in ordinary issue comments. A new comment from the
repository owner automatically queues the next planner turn with the issue body,
owner discussion and previous handoff. Other users and bots cannot trigger it.
Several replies received before the next run are included together. Replayed
comments do not trigger another call. Edits to old comments do not trigger work;
post a new comment to continue.

Use `/factory pause`, `/factory resume`, `/factory stop`, or `/factory retry` as
standalone comments. Pause holds work even when you add replies; resume explicitly
releases that hold. Stopped work cannot be resumed. Failed work requires retry,
with each fresh owner retry authorizing one bounded attempt.
Replies arriving during a call invalidate its result and queue the revised context.

A versioned `state.json` on `factory-state` is authoritative. The workflow creates
it on first use. Each accepted owner turn gets its own status comment. Do not delete the
state branch: processed comment IDs prevent replay. Do not edit old command
comments; post a new one. Closing an issue stops its work.

Every run reconciles owner comments in creation order, including commands posted
while the agent was running. A stopped/paused attempt cannot publish its result.
The repository-wide workflow lock permits one agent at a time. Other issues remain
queued until another event, manual dispatch, or the ten-minute reconciliation.
GitHub may delay scheduled runs. Pending Actions events can be replaced; replay
of durable issue comments repairs this without losing commands.

Interrupted attempts become failed on the next reconciliation. Status publication
is repeatable; the controller repairs a missing status after a crash. API failures
fail the workflow instead of overwriting unreadable state. State writes use the
GitHub content SHA to reject concurrent changes.

The controller always checks out main. Flue runs as a separate process with only
model credentials, and the planner uses Flue's local environment with only its built-in `read`, `grep`
and `glob` tools exposed. Paging, output limits and searching come from Flue.
These tools read the working filesystem and can follow symlinks; tool selection
is not filesystem isolation. The Actions runner provides the execution environment.
The planner has no model-callable shell or repository-writing tools. GitHub credentials stay in the controller. This is a bounded handoff agent,
not an isolation scheme for future code-executing agents.

Run `npm ci && npm run check` in this directory. Dependencies and lockfile are
separate from the Obsidian build so the agent runtime is not bundled into the plugin.

Flue 2.3.0 currently requires pi-ai/pi-agent-core 1.1.0; explicit overrides
prevent a newer compatible-range release from removing a required runtime export.
CLI startup is included in the checks so dependency drift cannot silently pass.

## Scheduled checks and costs

The ten-minute schedule reconciles commands and repairs status deterministically.
With no queued work it makes no model calls. It may run one queued item authorized
by an owner command or new discussion reply. Waiting work needs a new owner
reply; paused, failed and stopped items do not restart from discussion comments.
The scheduled job still starts an Actions runner and installs dependencies.

Cost reporting is tracked in [#77](https://github.com/nfelger/obsidian-tools/issues/77): per-turn issue comments are the sole cost
record, and the merge summary sums them. No separate cost ledger or usage artifacts.

Both agent entry points register the OpenRouter provider in `openrouter.ts`.
It supplements the pinned Pi catalog with MiniMax M3.1 Flash, which OpenRouter
serves but Pi 1.1.0 does not list. The supplement retains built-in authentication
and protocol dispatch; a future catalog entry takes precedence. Metadata comes
from [OpenRouter's model page](https://openrouter.ai/minimax/minimax-m3.1-flash)
and [endpoints API](https://openrouter.ai/api/v1/models/minimax/minimax-m3.1-flash/endpoints).
Its cost rates are list-price estimates; actual cost reporting still prefers
OpenRouter usage. The checks resolve every role default and exercise `flue run`
with a mocked OpenRouter response, without paid model calls.

## Checking a new installation

Configure the API key, create a small issue, and post `/factory start`. Confirm a
requirements handoff and acceptance cases arrive, then answer its questions in a comment and
check that a revised handoff arrives automatically. Exercise
pause/resume and stop during a run to verify stale replies are withheld. These
steps make paid model calls and require the workflow on main.

The controller consumes `flue run --json`: only a completed envelope with a
nonempty handoff and successful process exit becomes a successful result. Failure,
abort, setup errors, timeouts and malformed output produce a failed status. Each planning pass has five minutes. After a timeout the
controller retries once in the same turn, provided the turn is still current.
A second timeout ends the turn. Post `/factory retry` to start again.
A blocked planning handoff needs an owner decision. Reply to resume planning.

## Implementation and previews

After a planner handoff, post `/factory implement` to approve that exact requirements
snapshot and start coding. If you have since changed requirements, wait for the
updated planner handoff before approving. Implementation remains opt-in.

MiniMax runs in a Docker container with Flue's standard coding tools, two repair
cycles and one Opus escalation. The container has the OpenRouter key but no GitHub
token or Docker socket. Trusted runtime code and the candidate workspace are separate.
The controller accepts only text changes under `src/`, `tests/`, `styles.css`, `CHANGELOG.md`, `README.md`, and Markdown preview fixtures,
plus top-level factory TypeScript source/tests and factory/README.md for owner-reviewed factory work, with a bounded output size. Workflow, dependency, guidance and gate changes need
separate human-reviewed work. CI independently verifies the published commit.

The controller opens a draft PR on `factory/issue-<number>` and explicitly dispatches
the factory controller checks for factory-only changes. The issue links to the checked commit and draft PR for owner review. Product changes run product CI. On success it posts the exact candidate, CI evidence, and a browser Codespaces
preview link. Open the new Codespace on that issue branch; an existing Codespace
remains pinned to its prior build. Owner feedback automatically requests another
coding attempt on the same branch. Superseded coding and CI results cannot become
the current preview. Pause, stop and bounded retry controls remain available.

Enable Actions permission to create pull requests in repository settings if GitHub
rejects PR creation. The workflow requires contents, issues, pull-requests and
actions write permissions; publishing tokens remain outside the coding container.
Merge stays manual. Candidate history lives in issue comments.

The first completed issue-to-preview cycle is recorded in [issue #48](https://github.com/nfelger/obsidian-tools/issues/48) and [PR #53](https://github.com/nfelger/obsidian-tools/pull/53).

The coding container uses the runner's UID/GID so its workspace and output mounts
remain writable with all Linux capabilities dropped. Container setup failures
include the available process diagnostics even when no result file was produced.
New planning, coding, interrupted-run, or candidate-CI failures make reconciliation
exit unsuccessfully after saving state and publishing issue status. An idle run
does not fail merely because an issue was already failed. Retry failed work with
the owner command `/factory retry` after the underlying problem is fixed.

## Factory failure recovery

A new owner `/factory retry` comment authorizes one more attempt on a failed
issue, including after three failures. Failure history and the approved handoff
are retained; replaying the same comment cannot authorize another attempt.
Scheduled reconciliation does not automatically retry failed work. Each coding
attempt still has at most three implementer passes and one escalation pass.

Coding starts from the live issue branch, or main for a new branch. The controller
records validated edits with their original base in the run's coding-evidence
artifact (retained for 14 days). A retry of the same revision restores the patch
by cherry-picking it into a fresh checkout. This also recovers completed artifacts
from older runs blocked because their issue branch advanced.

If the branch advances before publication, the controller repeats that integration
within the same 45-minute budget. A clean, completed patch goes straight to
verification. Conflicts, incomplete work and failed checks go to the coding agent
for repair. Publication uses a non-forced update. New issue instructions supersede
the old revision and its checkpoint.

The coder reports acceptance-case evidence and remaining requirements in JSON.
Unfinished work, malformed reports, prohibited edits and failed checks feed the
next pass. A completed report must also pass fresh checks after its final edits.
This is agent-reported coverage, not independent proof of requirement correctness;
human preview remains required. Product docs CHANGELOG.md and README.md are
publishable; agent guidance remains protected even when a handoff requests edits.

State writes retry transient failures with read-back confirmation; a conflicting
writer is never overwritten. Run artifacts include the latest local state checkpoint
if saving fails permanently. Status reports show the current attempt's failure.

## Preview fixtures and startup

The disposable Codespace starts on container start and retries on editor attach.
Startup requests and desktop readiness failures appear in `.preview/session.log`.
A session lock prevents duplicate Obsidian processes. Periodic Notes 0.0.17 is
installed and enabled through obsidian-launcher, with daily, ISO-weekly, monthly,
quarterly and yearly folders/formats configured. Each launch applies the README’s periodic paths and disables core Daily Notes. Reset restores the fixture vault.

Add feature-specific Markdown notes under `.devcontainer/vault/`. Link them from
`Start here.md` with the action to take and the expected result for each scenario.
For current periods, use `{{dailyPath}}`, `{{weeklyPath}}`, `{{monthlyPath}}`,
or `{{yearlyPath}}`. These expand to the complete path configured in Periodic
Notes, including its folders. For example, put `{{weeklyPath}}.md` at the fixture
root and link to it as `[[{{weeklyPath}}]]`. A fresh seed or reset on 17 November
2026 expands that link to `[[+Diary/2026/11/2026-11-W47]]`.

Expansion applies to filenames and Markdown contents. Use `{{today}}`, `{{week}}`,
`{{month}}` and `{{year}}` for short labels. Use literal dates for historical
cases. Keep feature fixtures in Markdown and leave preview configuration and
launch scripts to the factory.

`WORKFLOW.md` is exclusively the owner's domain-level Obsidian workflow.
Document factory operations here and track planned factory work in GitHub issues.

## Completion reports and failure notifications

The controller parses a complete handoff (up to 1 MiB) before applying display
limits. It accepts bare JSON or one fenced JSON object with surrounding prose;
malformed or ambiguous reports remain incomplete. Acceptance cases marked
incomplete always block publication. Legacy remaining-work strings also block.
New remaining-work entries carry an explicit kind: `implementation` blocks,
while `publication`, `accepted-assumption` and `protected-documentation` are notes.
The latter describe controller-owned steps, defaults already approved in the
handoff and edits forbidden by policy; they cannot excuse an incomplete case.

The latest blocker is summarized when the pass budget is exhausted. Full raw
handoff evidence remains in the coding artifact. The factory updates the current turn’s acknowledgement with its result,
preview link or failure. Reconciliation repairs missing notifications without duplicating them.
