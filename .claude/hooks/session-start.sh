#!/bin/bash
# SessionStart hook: warm npm dependencies so lint, tests and the quality-gate
# hooks work from the first turn.
#
# Remote (web) sessions start from a fresh container where node_modules is
# absent; without this, the first `npx oxlint` or `npm test` of the session
# stalls on an install mid-task. Local sessions manage their own node_modules,
# so the hook does nothing there.
#
# `npm install` rather than `npm ci` on purpose: the container state is cached
# after the hook completes, and install is a fast no-op against a warm cache
# while ci deletes node_modules and starts over.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

npm install --no-audit --no-fund
