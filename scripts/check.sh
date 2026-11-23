#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
sh "$root/app/backend/scripts/check.sh"
cd "$root/app/frontend"
bun run test
bun run build
bun run build:demo
