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
workflow. Empty values use the default. The old `OPENROUTER_MODEL` variable is no
longer used; move a deliberate override to `PLANNER_MODEL`. Other roles are defined
for their later segments, which will wire their variables when activated.
Comment `/factory start` on an issue as the repository owner. The issue body is
the agreement. The first agent returns a concise handoff and acceptance cases;
product-code changes and preview creation are segment 3.

Use `/factory pause`, `/factory resume`, `/factory stop`, or `/factory retry` as
standalone comments. Resume snapshots the current issue body and advances the
specification revision if it changed. Edit the issue body to answer questions before
resuming; free-form comments are not yet incorporated. The previous handoff is
supplied alongside the revised agreement. Retry preserves evidence and permits at most
three failed attempts; opening another issue is the explicit fresh budget.

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
model credentials, and the handoff agent mounts no shell or repository-writing
tools. GitHub credentials stay in the controller. This is a bounded handoff agent,
not an isolation scheme for future code-executing agents.

Run `npm ci && npm run check` in this directory. Dependencies and lockfile are
separate from the Obsidian build so the agent runtime is not bundled into the plugin.
Activation and a model-backed issue trial require the merged workflow and secret.

Flue 2.3.0 currently requires pi-ai/pi-agent-core 1.1.0; explicit overrides
prevent a newer compatible-range release from removing a required runtime export.
CLI startup is included in the checks so dependency drift cannot silently pass.

## Escalation policy for the implementation segment

The implementer gets an initial attempt and up to two unsuccessful repair cycles
before handing the failure evidence to the escalation model. Escalate earlier for
an identified architectural problem. Requirement ambiguity returns to planning,
not to a coder making product decisions. This is separate from the controller's
failure/retry budget; coding escalation is not active in this segment.

## Scheduled checks and costs

The ten-minute schedule reconciles commands and repairs status deterministically.
With no queued work it makes no model calls. It may run one queued item authorized
by an owner start/resume/retry command. Waiting, blocked and stopped items do not
retry themselves. Each successful handoff waits for further owner input.
The scheduled job still starts an Actions runner and installs dependencies.

Cost reporting is planned in segment 7: per-turn issue comments are the sole cost
record, and the merge summary sums them. No separate cost ledger or usage artifacts.

## Live trial after merge

Configure the API key, create a small issue, and post `/factory start`. Confirm a
requirements handoff and acceptance cases arrive, then edit the issue body and
post `/factory resume`. Check the revised handoff. Exercise
pause/resume and stop during a run to verify stale replies are withheld. These
steps make paid model calls and require the workflow on main.
