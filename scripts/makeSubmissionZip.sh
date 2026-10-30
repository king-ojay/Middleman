#!/usr/bin/env bash
# Builds middleman-submission.zip at the repo root from the files git tracks,
# so node_modules/, .env files, data/ (the gitignored datasets) and .git/ are
# never included. Untracked local files are left out too; server/.env.example
# stays in (it holds variable names only).
#
#   bash scripts/makeSubmissionZip.sh [output.zip]
set -euo pipefail

cd "$(dirname "$0")/.."
out="${1:-middleman-submission.zip}"
rm -f "$out"

git ls-files \
  | grep -vE '(^|/)node_modules/|^data/|^\.git/' \
  | grep -vE '(^|/)\.env$|(^|/)\.env\.(local|production|development)$' \
  | zip -q "$out" -@

echo "wrote $out ($(du -h "$out" | cut -f1), $(unzip -Z1 "$out" | wc -l | tr -d ' ') files)"
if unzip -Z1 "$out" | grep -qE '(^|/)node_modules/|(^|/)\.env$|^data/|^\.git/'; then
  echo "ERROR: excluded files found in the archive" >&2
  exit 1
fi
