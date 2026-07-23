#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# block-secrets.sh  —  hook PreToolUse (Edit|Write)  [adaptado: agente-inmo]
#
# Bloquea escribir credenciales hardcodeadas. Además de los patrones genéricos,
# incluye los secretos propios de este proyecto (ver .env.example):
# META_APP_SECRET, APP_ENCRYPTION_KEY, OPENAI_API_KEY, GROQ_API_KEY (gsk_),
# ADMIN_MASTER_KEY, DATABASE_URL/REDIS_URL con password.
# exit 2 = BLOQUEA.  exit 0 = permite.
# ---------------------------------------------------------------------------
set -euo pipefail

input="$(cat)"

if command -v jq >/dev/null 2>&1; then
  content="$(printf '%s' "$input" | jq -r '.tool_input.content // .tool_input.new_string // .tool_input.replace // empty')"
  file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.path // empty')"
else
  content="$input"
  file=""
fi

[ -z "${content:-}" ] && exit 0

# Placeholders legítimos: no bloquear.
case "$file" in
  *.env.example|*.env.sample|*.env.template|*/README.md|*.md.example) exit 0 ;;
esac

patterns=(
  # --- Propios del proyecto (agente-inmo) ---
  'gsk_[A-Za-z0-9]{20,}'                                        # Groq API key
  'sk-[A-Za-z0-9]{20,}'                                         # OpenAI
  'sk-proj-[A-Za-z0-9_-]{20,}'                                  # OpenAI project keys
  '(APP_ENCRYPTION_KEY|META_APP_SECRET|META_VERIFY_TOKEN|ADMIN_MASTER_KEY|OPENAI_API_KEY|GROQ_API_KEY)[[:space:]]*=[[:space:]]*["'"'"']?[A-Za-z0-9/+=_-]{12,}'
  # --- Genéricos ---
  'AKIA[0-9A-Z]{16}'                                            # AWS Access Key ID
  'AIza[0-9A-Za-z_-]{35}'                                       # Google API key
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'                         # claves privadas PEM
  'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'  # JWT
  '(postgres|postgresql|redis|rediss)://[^:@/]+:[^@/]+@'        # connstring con password (Postgres/Redis)
  '(password|passwd|secret|api[_-]?key|token)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{8,}["'"'"']'
)

for p in "${patterns[@]}"; do
  if printf '%s' "$content" | grep -qEi -e "$p"; then
    echo "[block-secrets] BLOQUEADO: el contenido parece contener una credencial hardcodeada (patrón: $p)." >&2
    echo "Usá process.env / @nestjs/config y el .env (fuera de git). Nunca escribas el valor literal." >&2
    exit 2
  fi
done

exit 0
