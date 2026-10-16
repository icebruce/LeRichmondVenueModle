#!/usr/bin/env bash
# PreToolUse(Bash): block `git commit` unless `npm run check`
# (typecheck + lint + unit tests) passes.
#
# No-op until the toolchain exists. Exit 2 blocks the commit and shows
# the failure tail to Claude.

set -uo pipefail

payload=$(cat 2>/dev/null || true)
command=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null || true)

case "$command" in
  *'git commit'*) ;;
  *) exit 0 ;;
esac
case "$command" in
  *'--dry-run'*) exit 0 ;;
esac

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." >/dev/null 2>&1 && pwd) || exit 0
[ -f "$root/package.json" ] && [ -d "$root/node_modules" ] || exit 0
jq -e '.scripts.check' "$root/package.json" >/dev/null 2>&1 || exit 0

if ! out=$(cd "$root" && npm run -s check 2>&1); then
  printf 'Commit blocked: `npm run check` failed. Fix the errors, then commit again.\n%s\n' \
    "$(printf '%s' "$out" | tail -n 40)" >&2
  exit 2
fi
exit 0
