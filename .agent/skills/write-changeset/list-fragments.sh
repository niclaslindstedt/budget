#!/usr/bin/env bash
# List every unreleased changeset fragment with its body, one screenful.
# Used by the write-changeset skill to inspect the queue before deciding
# whether a new fragment is needed or an existing one should be edited.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
DIR=".changes/unreleased"

shopt -s nullglob
files=("$DIR"/*.md)

if [ "${#files[@]}" -eq 0 ]; then
    echo "No unreleased fragments in $DIR." >&2
    exit 0
fi

for f in "${files[@]}"; do
    printf '\n=== %s ===\n' "$(basename "$f")"
    cat "$f"
done
