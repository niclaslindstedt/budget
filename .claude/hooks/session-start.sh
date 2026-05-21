#!/bin/bash
# Ensure tags and full history are present so tag-aware tooling
# (`git describe`, `git tag --list 'v*'`, the write-changeset skill's
# baseline detection) works in Claude Code on the web sessions. The
# harness clones the repo shallow and without tags by default, which
# silently breaks `git tag --list 'v*' | head -1` → falls through to
# the initial commit and classifies every shipped feature as
# "in-flight unreleased".
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
  git fetch --tags --unshallow origin || git fetch --tags origin
else
  git fetch --tags origin
fi
