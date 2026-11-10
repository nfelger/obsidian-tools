# Issue controller

After this workflow is merged, add the `OPENROUTER_API_KEY` repository secret.
All model calls go through OpenRouter. Role defaults live in `models.ts`:

| Role | Default model | Actions variable |
| --- | --- | --- |
| Requirements and planning | `anthropic/claude-opus-5.5` | `PLANNER_MODEL` |
| Implementation | `minimax/minimax-m3.1-flash` | `IMPLEMENTER_MODEL` |
| Escalation and architecture review | `anthropic/claude-opus-5.5` | `ESCALATION_MODEL` |
| Bounded clerical tasks | `openai/gpt-6-luna` | `UTILITY_MODEL` |

Only the planner runs in this segment, and only `PLANNER_MODEL` is wired into the
workflow. Empty values use the default. Other roles will be wired into their
respective segments when activated.
Comment `/factory start` on an issue as the repository owner. The issue body and
your preceding discussion comments form the requirements snapshot. The first agent returns a concise handoff and acceptance cases;
product-code changes and preview creation are segment 3.

Answer planner questions in ordinary issue comments. A new comment from the
repository owner automatically queues the next planner turn with the issue body,
owner discussion and previous handoff. Other users and bots cannot trigger it.
Several replies received before the next run are included together. Replayed
comments do not trigger another call. Edits to old comments do not trigger work;
post a new comment to continue.

Use `/factory pause`, `/factory resume`, `/factory stop`, or `/factory retry` as
standalone comments. Pause holds work even when you add replies; resume explicitly
releases that hold. Stopped work cannot be resumed. Failed work requires retry,
with at most three failed attempts; another issue is the explicit fresh budget.
Replies arriving during a call invalidate its result and queue the revised context.

A versioned `state.json` on `factory-state` is authoritative. The workflow creates
it on first use. One bot status comment mirrors each record. Do not delete the
state branch: processed comment IDs prevent replay. Do not edit old command
comments; post a new one. Closing an issue stops its work.

Every run reconciles owner comments in creation order, including commands posted
while the agent was running. A stopped/paused attempt cannot publish its result.
The repository-wide workflow lock permits one agent at a time. Other issues remain
queued until another event, manual dispatch, or the ten-minute reconciliation.
GitHub may delay scheduled runs. Pending Actions events can be replaced; replay
of durable issue comments repairs this without losing commands.

Interrupted attempts become blocked on the next reconciliation. Status publication
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
Activation and a model-backed issue trial require the merged workflow and secret.

Flue 2.3.0 currently requires pi-ai/pi-agent-core 1.1.0; explicit overrides
prevent a newer compatible-range release from removing a required runtime export.
CLI startup is included in the checks so dependency drift cannot silently pass.

## Scheduled checks and costs

The ten-minute schedule reconciles commands and repairs status deterministically.
With no queued work it makes no model calls. It may run one queued item authorized
by an owner command or new discussion reply. Waiting work needs a new owner
reply; paused, blocked and stopped items do not restart from discussion comments.
The scheduled job still starts an Actions runner and installs dependencies.

Cost reporting is planned in segment 7: per-turn issue comments are the sole cost
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

## Live trial after merge

Configure the API key, create a small issue, and post `/factory start`. Confirm a
requirements handoff and acceptance cases arrive, then answer its questions in a comment and
check that a revised handoff arrives automatically. Exercise
pause/resume and stop during a run to verify stale replies are withheld. These
steps make paid model calls and require the workflow on main.

The controller consumes `flue run --json`: only a completed envelope with a
nonempty handoff and successful process exit becomes a successful result. Failure,
abort, setup errors, timeouts and malformed output produce a blocked status.

## Implementation and previews

After a planner handoff, post `/factory implement` to approve that exact requirements
snapshot and start coding. If you have since changed requirements, wait for the
updated planner handoff before approving. Implementation remains opt-in.

MiniMax runs in a Docker container with Flue's standard coding tools, two repair
cycles and one Opus escalation. The container has the OpenRouter key but no GitHub
token or Docker socket. Trusted runtime code and the candidate workspace are separate.
The controller accepts only text changes under `src/`, `tests/`, or `styles.css`,
with a bounded output size. Workflow, dependency, guidance and gate changes need
separate human-reviewed work. CI independently verifies the published commit.

The controller opens a draft PR on `factory/issue-<number>` and explicitly dispatches
CI. On success it posts the exact candidate, CI evidence, and a browser Codespaces
preview link. Open the new Codespace on that issue branch; an existing Codespace
remains pinned to its prior build. Owner feedback automatically requests another
coding attempt on the same branch. Superseded coding and CI results cannot become
the current preview. Pause, stop and bounded retry controls remain available.

Enable Actions permission to create pull requests in repository settings if GitHub
rejects PR creation. The workflow requires contents, issues, pull-requests and
actions write permissions; publishing tokens remain outside the coding container.
Merge stays manual. Candidate history lives in issue comments.

The container/model and issue-to-preview loop need a hosted trial after merge.

The coding container uses the runner's UID/GID so its workspace and output mounts
remain writable with all Linux capabilities dropped. Container setup failures
include the available process diagnostics even when no result file was produced.
New planning, coding, interrupted-run, or candidate-CI failures make reconciliation
exit unsuccessfully after saving state and publishing issue status. An idle run
does not fail merely because an issue was already blocked. Retry blocked work with
the owner command `/factory retry` after the underlying problem is fixed.
