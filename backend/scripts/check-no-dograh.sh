#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

if grep -rli "dograh" backend/src frontend/src --include=*.js --include=*.jsx > /dev/null; then
  echo "Dograh references remain:"
  grep -rli "dograh" backend/src frontend/src --include=*.js --include=*.jsx
  exit 1
fi

echo "No Dograh references."
