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

# Enciende (true) / apaga (false) el banner de mantenimiento vía PostgREST, y de
# paso deja registrado en la fila QUÉ commit quedó publicado y CUÁNDO.
# Nunca aborta el despliegue: si algo falla, lo escribe en el log y sigue.
aviso() {
  # Si faltan credenciales lo DECIMOS en el log. Antes se salía en silencio: el
  # despliegue seguía igual, pero nadie podía notar que el banner no se estaba
  # encendiendo. Un fallo mudo en la única señal de despliegue no sirve.
  if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    echo "$(date '+%F %T') · AVISO OMITIDO: falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local" >> "$LOG"
    return 0
  fi
  # `updated_at` se escribe A MANO: la tabla no tiene trigger que lo mueva, así
  # que si no lo mandamos acá la fila queda congelada en la fecha de la última
  # edición manual y NO sirve para saber cuándo publicó el sitio por última vez
  # (fue exactamente lo que despistó el diagnóstico del cron roto).
  # `updated_by` deja el commit desplegado: la fila pasa a ser el registro de
  # «qué versión está publicada y desde cuándo».
  local body ahora quien
  ahora="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  quien="deploy:${REMOTE:0:7}"
  if [ "$1" = "true" ]; then
    body=$(printf '{"activo":true,"mensaje":"%s","minutos":%s,"updated_at":"%s","updated_by":"%s"}' \
      "$AVISO_MENSAJE" "$AVISO_MINUTOS" "$ahora" "$quien")
  else
    body=$(printf '{"activo":false,"updated_at":"%s","updated_by":"%s"}' "$ahora" "$quien")
  fi
  # Se guarda el código HTTP y se registra si NO es 2xx. El despliegue continúa
  # igual (el banner es accesorio), pero el fallo queda escrito en vez de
  # perderse: antes iba todo a /dev/null con `|| true` y un 401 por clave
  # vencida se veía idéntico a un éxito.
  local codigo
  codigo="$(curl -s -o /dev/null -w '%{http_code}' -X PATCH \
    "$SUPABASE_URL/rest/v1/aviso_mantenimiento?id=eq.1" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "$body" || echo 000)"
  case "$codigo" in
    2*) ;;
    *) echo "$(date '+%F %T') · AVISO FALLÓ (HTTP $codigo) al poner activo=$1" >> "$LOG" ;;
  esac
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
  # VITE_APP_VERSION fijada al commit EXACTO desplegado: así version.json = commit y el
  # aviso "el sistema se actualizó" solo aparece cuando main avanzó de verdad (nunca por
  # un rebuild del mismo código). Este script ya solo construye cuando hay commit nuevo.
  VITE_BASE_PATH=/ VITE_APP_VERSION="$(git rev-parse --short HEAD)" npm run build
  systemctl reload nginx
  echo "$(date '+%F %T') · deploy OK en ${REMOTE:0:7}"
} >> "$LOG" 2>&1

# El trap EXIT apaga el aviso aquí.
