#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit): format and lint-fix the edited file.
#
# No-op until the toolchain is installed (package.json + node_modules).
# Exit 2 with remaining lint errors on stderr so Claude sees them at once;
# the edit itself has already happened, so this never blocks anything.

set -uo pipefail

payload=$(cat 2>/dev/null || true)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // ""' 2>/dev/null || true)
[ -n "$file" ] && [ -f "$file" ] || exit 0

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." >/dev/null 2>&1 && pwd) || exit 0
bin="$root/node_modules/.bin"
[ -x "$bin/prettier" ] || exit 0

case "$file" in
  "$root"/node_modules/*|"$root"/dist/*|"$root"/docs/handover/*) exit 0 ;;
esac

case "$file" in
  *.ts|*.tsx|*.js|*.mjs|*.cjs|*.json|*.css|*.html|*.md)
    "$bin/prettier" --log-level warn --write "$file" >/dev/null 2>&1 || true ;;
  *) exit 0 ;;
esac

case "$file" in
  *.ts|*.tsx|*.js|*.mjs|*.cjs)
    if [ -x "$bin/eslint" ]; then
      if ! out=$(cd "$root" && "$bin/eslint" --fix --no-warn-ignored "$file" 2>&1); then
        printf 'ESLint errors remain in %s:\n%s\n' "$file" "$(printf '%s' "$out" | tail -n 30)" >&2
        exit 2
      fi
    fi ;;
esac
exit 0
