# Checked Builds and Releases

Stable releases and test candidates use the same quality gate. Development branch
pushes no longer publish GitHub prereleases into BRAT's update stream.

## Stable installation

Install `nfelger/obsidian-tools` through BRAT, or download `main.js`,
`manifest.json`, and `styles.css` from a specific stable GitHub release into
`<vault>/.obsidian/plugins/bullet-flow/`.

**Existing BRAT users:** historical development releases remain available. Freeze
BRAT to a chosen stable release tag if its latest selection would pick an old
higher-version development release. This change does not delete existing releases
or change your BRAT settings remotely.

## Request a candidate

Push a `factory/**` or `claude/**` branch, or open a PR targeting `main`. Once this
workflow is on the default branch, you can also run **CI → Run workflow** and
select a branch. Branch names outside those patterns receive CI through their PR.

The workflow runs lint, coverage, the coverage-weighted code audit, and the build,
then tests those exact built files in desktop Obsidian. Only after both jobs pass
does it publish an Actions artifact named `bullet-flow-<sha>-<run>-<attempt>`.
For PR runs the SHA identifies GitHub's tested merge commit, not merely the branch
head. Find the bundle under the workflow run's **Artifacts** section; GitHub
requires sign-in to download Actions artifacts.

Download the complete ZIP. It contains the plugin files, `quality.json` with the
commands and asset hashes, `candidate.json` with the exact commit/run identity,
and `INSTALL.md`. Candidate retention is requested for 90 days (repository policy
may impose a shorter limit); download builds you need to keep. The intermediate
`checked-build-*` artifact is for job handoff and is **not** an approved candidate:
E2E may still fail after it is uploaded.

## Preview in your browser

Use the [Codespaces preview](PREVIEW.md) for the normal review loop. It installs
the checked branch candidate automatically in real Obsidian with synthetic notes.
Manual installation below remains available for testing on your own device.

## Install an exact candidate (optional)

Use a disposable test vault first.

1. Disable Bullet Flow in that vault. Remove `nfelger/obsidian-tools` from BRAT's
   tracking list there; removing tracking does not uninstall the plugin. This keeps
   BRAT from replacing the candidate during the trial.
2. Save the installed `main.js`, `manifest.json`, and `styles.css` together as your
   rollback copy. Back up test notes separately if their contents matter.
3. Extract the candidate ZIP and replace those three files in
   `<vault>/.obsidian/plugins/bullet-flow/`. Leave `data.json` untouched.
4. Reload Obsidian and enable Bullet Flow. Keep `candidate.json` with the downloaded
   bundle so feedback can identify the exact build.

The manifest retains the stable base version: no source version bump or rebuild
occurs after checks. The candidate's identity is its SHA/run/attempt and asset
hashes, not the version shown in Obsidian settings. Another candidate never installs
itself automatically.

On mobile this path requires access to the vault's plugin folder, including hidden
folders. If your device's file manager cannot do that, use an accessible test vault
or transfer the files through your existing vault-file setup. Do not assume
Obsidian Sync transfers plugin files without confirming its configuration.
Convenient mobile installation is a device trial, not an automated guarantee.

## Return to stable

Disable Bullet Flow, replace the same three files with the saved stable copy (or
assets downloaded from an explicit stable release), then reload and enable it.
Manual file replacement supports returning to an older version without relying on
BRAT's version comparison. Resume BRAT tracking if desired; freeze to an explicit
stable tag while historical development releases could still win latest selection.
Restoring plugin binaries does not undo changes already made to notes.

## Why candidates are not GitHub prereleases

[BRAT's developer guide](https://github.com/TfTHacker/obsidian42-brat/blob/main/BRAT-DEVELOPER-GUIDE.md)
describes latest tracking as including prereleases and frozen tracking as selecting
an exact tag. `prerelease: true` and `makeLatest: false` therefore do not isolate
stable users. Actions artifacts provide isolation without a second repository or
relying on undocumented tag ordering. This deliberately chooses manual installation
for the first factory segment; BRAT's frozen-version UI/downgrade path is not a
prerequisite and has not been tested here on the user's devices.

## Gate and publication contract

- `npm ci`, then `npm run check` runs the shared noninteractive gate. Set
  `FALLOW_AUDIT_BASE` to the intended base commit; otherwise Fallow uses its normal
  base selection. CI explicitly supplies the PR base or previous main commit.
- The command bypasses npm lifecycle hooks for each check, so Claude's local
  test-stamp hooks are not needed. Existing local hooks remain available.
- Failed checks stop immediately and remove any previous `build/checked` output.
  Advisory lint warnings and pre-existing audit debt retain their existing policy.
- `ci.yml` is reusable. It supplies the exact checked bundle to `e2e.yml` and, for
  non-main builds, packages a candidate after E2E succeeds. No publishing token is
  available to those jobs.
- `release-on-push.yml` handles only `main`, calls the same CI workflow, then uses
  a separate write-enabled job to publish the checked assets for a new stable tag.
  Existing tags are left unchanged. Version bumps and changelog conventions are
  unchanged; use the existing release procedure.
- Artifact names include the run attempt. Use **Re-run all jobs** when retrying a
  failed run, so every job shares an artifact from that attempt.

## Manual acceptance still required

Try a real candidate in a desktop test vault, install a later candidate deliberately,
and return to the saved stable files. Repeat on the mobile device if it is part of
your testing workflow. Confirm ordinary stable vaults stay unchanged throughout.
Record the device, candidate identity, and outcome in the implementation PR.
CI verifies plugin execution and packaging, not these user-device operations.
