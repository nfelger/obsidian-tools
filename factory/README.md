# Issue controller

After this workflow is merged, add the `ANTHROPIC_API_KEY` repository secret.
Comment `/factory start` on an issue as the repository owner. The issue body is
the agreement. The first agent returns a concise handoff and acceptance cases;
product-code changes and preview creation are segment 3.

Use `/factory pause`, `/factory resume`, `/factory stop`, or `/factory retry` as
standalone comments. Resume snapshots the current issue body and advances the
specification revision if it changed. Retry preserves evidence and permits at most
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
