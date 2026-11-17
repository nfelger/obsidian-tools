#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# The Node feature installs through nvm; desktop and lifecycle shells do not load it.
export NVM_DIR="${NVM_DIR:-/usr/local/share/nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    set +u
    source "$NVM_DIR/nvm.sh"
    set -u
fi
node_path="$(command -v node)" || {
    echo 'Node is unavailable. Rebuild the container with the Node feature enabled.' >&2
    exit 1
}
mkdir -p .preview
exec 9>.preview/session.lock
if ! flock -n 9; then
    echo 'Preview session already running; leaving it in place.'
    exit 0
fi
exec "$node_path" preview-launch.mjs "$@"
