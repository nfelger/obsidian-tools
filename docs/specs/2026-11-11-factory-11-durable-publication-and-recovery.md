# Software Factory 11: Durable Publication and Recovery

## Goal

Recover cleanly from interrupted GitHub operations without duplicating side effects or repeating successful coding work.

## Scope

- Reconcile the actual GitHub state before retrying branch updates, draft PR creation, CI dispatch, and preview-comment publication. A lost API response does not imply that the operation failed.
- Once a validated candidate has been committed, preserve its identity and resume publication or verification without rerunning the coding agent.
- Distinguish coding failures from recoverable infrastructure/publication failures. Report current status from current facts, without retaining obsolete errors after successful recovery.
- Preserve existing protection against superseded issue revisions and unexpected branch changes.

## Implementation Guidance

Extend the existing GitHub Actions controller and `factory-state` ledger. Prefer stable operation identities and GitHub lookups to additional synchronized state. Keep the change narrowly scoped: no new workflow engine, database, event log, or persistent agent sessions.

Add failure-injection tests around the publication boundaries, especially when GitHub accepted an operation but the response was lost or the controller stopped before saving state.

## Completion Criteria

- A branch update, PR creation, or CI dispatch that succeeded despite a lost response is detected and reused during reconciliation.
- Recovery after successful coding does not invoke the coding agent again.
- Repeated reconciliation creates no duplicate PRs or candidate comments and never overwrites an unexpected branch head.
- A recovered successful preview does not show an obsolete failure as its current status.
- Existing factory checks and focused recovery tests pass.

## Sequence

Status: proposed. Segment 11, following the existing segments 1–10. This strengthens the controller and publication behavior used by segments 3 and 6; it does not replace their scope.

## Reference

[Durable Execution for AI Agents](https://martinfowler.com/articles/durable-execution-agents.html) — motivation for replay-safe side effects and explicit recovery boundaries.
