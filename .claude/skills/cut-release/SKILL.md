---
name: cut-release
description: Use when ready to publish a stable release from main — promotes ## Unreleased in CHANGELOG to a versioned entry, bumps manifest.json + package.json + versions.json in one commit, and pushes to main to trigger CI deployment
---

# Cut a Release

## Overview

Promote unreleased changes to a versioned stable release and push to main.
CI will build the plugin and publish the GitHub release automatically.
BRAT will pick up the new stable version within minutes.

**Core principle:** CHANGELOG first, version second. One commit, one push.

**Announce at start:** "I'm using the cut-release skill."

## The Process

### Step 1: Verify preconditions

```bash
git branch --show-current   # must be main
npm test
```

- If not on `main`: stop — "Switch to main first (`git checkout main`)."
- If tests fail: show failures, stop.
- Read CHANGELOG.md — check for `## Unreleased` with actual content (not just heading).
  If absent or empty: stop — "Nothing to release — add content under `## Unreleased` first."

### Step 2: Show current state

Report:
- Current version (from `manifest.json`)
- Full content of the `## Unreleased` section

### Step 3: Ask for bump type

```
Current version: X.Y.Z

1. Patch  →  X.Y.Z+1  (bug fixes)
2. Minor  →  X.Y+1.0  (new features)
3. Major  →  X+1.0.0  (breaking changes)
4. Custom version

Which?
```

### Step 4: Preview and confirm

```
Ready to release vA.B.C (YYYY-MM-DD):

[CHANGELOG content]

Proceed? (y/N)
```

Wait for explicit confirmation before executing.

### Step 5: Execute atomically

All four edits in one commit:

1. **CHANGELOG.md** — replace `## Unreleased` with `## [A.B.C] - YYYY-MM-DD`
   (use today's date; do not add a new empty `## Unreleased` section)

2. **manifest.json** — update `"version"` field to `"A.B.C"`

3. **package.json** — update `"version"` field to `"A.B.C"`

4. **versions.json** — add entry `"A.B.C": "1.0.0"` (always maps to `"1.0.0"`)

5. Commit all four files:
   ```bash
   git add CHANGELOG.md manifest.json package.json versions.json
   git commit -m "release: bump to vA.B.C"
   ```

6. Push:
   ```bash
   git push
   ```

### Step 6: Report

```
Released vA.B.C — CI will build and publish the GitHub release.
BRAT will update automatically once the release is live.
```

## Red Flags

**Never:**
- Commit version files without CHANGELOG being updated in the same commit
- Cut a release from a non-main branch
- Release with failing tests
- Add an empty `## Unreleased` section after releasing

**Always:**
- Confirm with user before executing
- All four file changes in one atomic commit

## Integration

**Called by:**
- **finishing-a-development-branch** — offered after a successful local merge to main
- Can also be invoked directly when already on main
