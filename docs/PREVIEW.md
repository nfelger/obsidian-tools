# Browser preview in Codespaces

Create a Codespace from the candidate's `factory/**` or `claude/**` branch. Choose
the smallest (two-core) machine. Wait for setup, then open **Obsidian preview** on
port **6080** in the Ports panel if it does not open automatically. Connect using
the desktop password `vscode`. Keep the forwarded port **private**.

Obsidian opens a synthetic test vault with Bullet Flow enabled. Open **Start here**
and **Candidate**. No ZIP download, local plugin installation, or personal vault
is required. The desktop may appear before CI or the Obsidian download finishes.

The first launch waits up to ten minutes for a successful push CI run matching the
checked-out commit. It downloads only the final candidate artifact, verifies its
commit, E2E result and asset hashes, then launches Obsidian. It never builds an
unchecked replacement. PR merge artifacts are distinct from branch push artifacts.
Other branch patterns, expired artifacts, failed CI and main are not supported by
this preview bootstrap. Re-run successful branch CI if its artifact has expired.

Resuming keeps the same candidate and test notes, even if the branch advances.
Create a new Codespace for a new candidate. Close Obsidian, right-click the desktop and choose
**Reset preview** to restore fixture notes without changing builds.
The installed Obsidian application uses the launcher's current stable version;
this is not a pinned Obsidian-version compatibility environment.

## Finish and keep costs at zero

Use [Your Codespaces](https://github.com/codespaces) to **Stop** when finished and
**Delete** when the trial is over. Closing the preview tab is insufficient. Stopped
Codespaces still consume storage. Set a short idle timeout in your Codespaces
settings and disable paid overage in your GitHub billing settings. Free allowances
are account-wide; this repository cannot enforce your account's spending limit.
Do not add production secrets or personal notes to this test environment.

## Troubleshooting

Setup and application output is in `.preview/session.log`. After resolving a CI
or authentication failure, run `bash .devcontainer/start.sh` in the Codespaces
terminal. Repeating it while a session runs does not launch another Obsidian.
The bootstrap needs the Codespace's repository token to read Actions artifacts.
Application child processes receive only desktop environment variables, though
this is a development container, not a security boundary for untrusted plugins.

If the log is waiting for an old commit whose CI failed, let that launch exit,
then run `git pull --ff-only` and restart the preview. A running launch keeps the
commit it started with. Once a candidate has been installed, it stays pinned;
create a new Codespace to trial a different candidate.

Container startup, browser access and an Extract log trial have been confirmed.
Reset behavior and device-specific installation remain separate acceptance checks.
