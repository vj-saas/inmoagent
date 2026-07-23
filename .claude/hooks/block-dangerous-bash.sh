#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# block-dangerous-bash.sh  —  hook PreToolUse (Bash)  [adaptado: agente-inmo]
#
# Bloquea comandos destructivos sin confirmación explícita. Suma a los genéricos
# los peligros propios de este proyecto (Prisma/Postgres/Redis/Docker).
# exit 2 = BLOQUEA.  exit 0 = permite.
# ---------------------------------------------------------------------------
set -euo pipefail

input="$(cat)"

if command -v jq >/dev/null 2>&1; then
  cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"
else
  cmd="$(printf '%s' "$input" | grep -oE '"command"[[:space:]]*:[[:space:]]*"[^"]+"' | head -n1 | sed -E 's/.*"command"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
fi

[ -z "${cmd:-}" ] && exit 0

block() {
  echo "[block-dangerous-bash] BLOQUEADO: $1" >&2
  echo "Si de verdad lo necesitás, corrélo vos manualmente o pedí confirmación explícita al usuario." >&2
  exit 2
}

# --- Propios del proyecto (Prisma / Postgres / Redis / Docker) --------------
printf '%s' "$cmd" | grep -qiE 'prisma[[:space:]]+migrate[[:space:]]+reset' \
  && block "prisma migrate reset (borra y recrea la base — pierde todos los datos)."
printf '%s' "$cmd" | grep -qiE 'prisma[[:space:]]+db[[:space:]]+push[^|;&]*--force-reset' \
  && block "prisma db push --force-reset (resetea el schema y los datos)."
printf '%s' "$cmd" | grep -qiE 'docker[[:space:]]+compose[^|;&]*down[^|;&]*(-v|--volumes)' \
  && block "docker compose down -v (borra los volúmenes: Postgres y Redis locales)."
printf '%s' "$cmd" | grep -qiE '\b(DROP[[:space:]]+(TABLE|DATABASE|SCHEMA)|TRUNCATE[[:space:]]+TABLE|DELETE[[:space:]]+FROM[[:space:]]+[^ ]+[[:space:]]*(;|$))' \
  && block "sentencia SQL destructiva (DROP/TRUNCATE/DELETE sin WHERE)."
printf '%s' "$cmd" | grep -qiE 'redis-cli[^|;&]*\bFLUSHALL\b|redis-cli[^|;&]*\bFLUSHDB\b' \
  && block "redis-cli FLUSHALL/FLUSHDB (vacía la cola/cache)."

# --- Genéricos --------------------------------------------------------------
printf '%s' "$cmd" | grep -qE '\brm\b[^|;&]*-[a-zA-Z]*r[a-zA-Z]*f|\brm\b[^|;&]*-[a-zA-Z]*f[a-zA-Z]*r' \
  && printf '%s' "$cmd" | grep -qE 'rm[^|;&]*(-[a-zA-Z]* )?(/|~|\$HOME|\*|\.\.)' \
  && block "rm recursivo/forzado sobre una ruta amplia o sensible."

printf '%s' "$cmd" | grep -qE 'git[^|;&]*push[^|;&]*(--force|-f)' \
  && printf '%s' "$cmd" | grep -qE '\b(main|master|prod|production)\b|--force[^|;&]*$|-f[^|;&]*$' \
  && block "git push --force (puede reescribir historia en una rama protegida)."

printf '%s' "$cmd" | grep -qE 'mkfs|dd[[:space:]]+if=.*of=/dev/|:\(\)\s*\{\s*:\|:' \
  && block "comando de wipe de disco o fork bomb."

exit 0
