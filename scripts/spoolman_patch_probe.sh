#!/usr/bin/env bash
set -euo pipefail

if [ -z "${BASE:-}" ] || [ -z "${ID:-}" ]; then
  echo "Usage:"
  echo "  BASE=http://host:port ID=123 ./scripts/spoolman_patch_probe.sh"
  exit 1
fi

echo "### BEFORE"
curl -sS "$BASE/api/v1/spool/$ID" | head -c 800; echo
echo

echo "### PATCH"
curl -sS -X PATCH "$BASE/api/v1/spool/$ID" \
  -H "Content-Type: application/json" \
  -d '{"remaining_weight": 777}' | head -c 800; echo
echo

echo "### AFTER"
curl -sS "$BASE/api/v1/spool/$ID" | head -c 800; echo
echo

echo "Done."
