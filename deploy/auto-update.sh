#!/usr/bin/env bash
# ============================================================
#  Auto-deploy de Golden Touch 1127 CA en el Droplet.
#  Corre por cron cada <=3 min. Solo reconstruye si main avanzó.
#  Instalación: ver deploy/README-deploy.md
#
#  AVISO DE MANTENIMIENTO: SOLO cuando hay un commit nuevo (un despliegue
#  real) enciende el banner de la app antes de construir y lo apaga al
#  terminar (incluso si algo falla, vía trap). En los ticks del cron sin
#  cambios NO se muestra nada. Requiere SUPABASE_SERVICE_ROLE_KEY en el
#  .env.local (bypassa RLS; es server-side, nunca va al bundle del cliente).
# ============================================================
set -euo pipefail

# cron arranca con PATH mínimo: aseguramos node/npm/git/systemctl/curl
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME="${HOME:-/root}"

REPO="/var/www/Golden-Touch-1127-CA"
BRANCH="main"
LOG="/var/log/golden-touch-deploy.log"
AVISO_MINUTOS=2
AVISO_MENSAJE="Se está aplicando una actualización del sistema. Por favor, guardá tu progreso y recargá la página en un momento."

cd "$REPO"

# Evitar que dos corridas se pisen (un build puede durar más de 3 min).
exec 9>/tmp/golden-touch-deploy.lock
flock -n 9 || exit 0

# ¿Hay algo nuevo en origin/main?
git fetch origin "$BRANCH" --quiet
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0   # sin cambios → no hacemos nada (ni avisamos)
fi

# Credenciales para el aviso (de .env.local / .env, gitignored).
if [ -f .env.local ]; then set -a; . ./.env.local; set +a; fi
if [ -f .env ]; then set -a; . ./.env; set +a; fi
SUPABASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"

# Enciende (true) / apaga (false) el banner de mantenimiento vía PostgREST.
# Si faltan credenciales, no hace nada y el deploy continúa igual.
aviso() {
  [ -z "${SUPABASE_URL:-}" ] && return 0
  [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && return 0
  local body
  if [ "$1" = "true" ]; then
    body=$(printf '{"activo":true,"mensaje":"%s","minutos":%s}' "$AVISO_MENSAJE" "$AVISO_MINUTOS")
  else
    body='{"activo":false}'
  fi
  curl -s -o /dev/null -X PATCH \
    "$SUPABASE_URL/rest/v1/aviso_mantenimiento?id=eq.1" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "$body" || true
}

# Despliegue real: enciende el aviso y garantiza apagarlo pase lo que pase.
aviso true
trap 'aviso false' EXIT

{
  echo "----------------------------------------"
  echo "$(date '+%F %T') · cambios: ${LOCAL:0:7} -> ${REMOTE:0:7}"
  # .env.local / node_modules / dist están en .gitignore → reset no los borra
  git reset --hard "origin/$BRANCH"
  npm ci
  VITE_BASE_PATH=/ npm run build
  systemctl reload nginx
  echo "$(date '+%F %T') · deploy OK en ${REMOTE:0:7}"
} >> "$LOG" 2>&1

# El trap EXIT apaga el aviso aquí.
