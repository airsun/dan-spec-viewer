#!/usr/bin/env bash
set -euo pipefail

if command -v spec-readr >/dev/null 2>&1; then
  exec spec-readr web "$@"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/../src/cli.js" web "$@"
