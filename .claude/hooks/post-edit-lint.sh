#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# post-edit-lint.sh  —  hook PostToolUse (Edit|Write)  [adaptado: agente-inmo]
#
# Stack: NestJS + TypeScript, ESLint 9 (flat config eslint.config.mjs) + Prettier.
# Corre ESLint --fix y Prettier sobre el archivo .ts recién tocado. No bloquea.
# ---------------------------------------------------------------------------
set -euo pipefail

input="$(cat)"

if command -v jq >/dev/null 2>&1; then
  file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.path // empty')"
else
  file="$(printf '%s' "$input" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]+"' | head -n1 | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
fi

[ -z "${file:-}" ] && exit 0
[ -f "$file" ] || exit 0

run() { echo "[post-edit-lint] $*" >&2; "$@" || true; }

case "$file" in
  *.ts)
    # ESLint flat config (eslint.config.mjs) — el script "lint" del proyecto usa --fix.
    run npx --no-install eslint --fix "$file"
    # Prettier (.prettierrc presente).
    run npx --no-install prettier --write "$file"
    ;;
  *.json|*.md|*.yml|*.yaml)
    run npx --no-install prettier --write "$file"
    ;;
  *)
    ;;
esac

exit 0
