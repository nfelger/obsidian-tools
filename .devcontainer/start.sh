#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .preview "$HOME/.fluxbox"
cat > "$HOME/.fluxbox/menu" <<MENU
[begin] (Bullet Flow preview)
[exec] (Reset preview - close Obsidian first) {bash -c 'cd "$PWD" && flock -n .preview/session.lock node preview-launch.mjs --reset >> .preview/session.log 2>&1'}
[exec] (Terminal) {xterm}
[end]
MENU
# A lock prevents duplicate desktops on reconnect or manual restart.
nohup flock -n .preview/session.lock node preview-launch.mjs > .preview/session.log 2>&1 < /dev/null &
