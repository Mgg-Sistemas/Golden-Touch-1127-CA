#!/usr/bin/env bash
# ============================================================
#  Auto-deploy de Golden Touch 1127 CA en el Droplet.
#  Corre por cron cada <=3 min. Solo reconstruye si main avanzó.
#  Instalación: ver deploy/README-deploy.md
#
#  MARCA DE DESPLIEGUE: al terminar un despliegue real deja anotado en la base
#  QUÉ commit quedó publicado y CUÁNDO. Es el único registro para saber si el
#  Droplet está al día. Requiere SUPABASE_SERVICE_ROLE_KEY en el .env.local
#  (bypassa RLS; es server-side, nunca va al bundle del cliente).
#
#  NO enciende ningún cartel. Al usuario le sale un solo aviso —«el sistema se
#  actualizó»— y sale cuando la versión nueva YA está publicada, que es cuando
#  recargar sirve de algo. El viejo banner «Mantenimiento del sistema» avisaba
#  de algo que todavía no había pasado y aparecía pegado al otro: se retiró el
#  04/09/2026.
# ============================================================
set -euo pipefail

# cron arranca con PATH mínimo: aseguramos node/npm/git/systemctl/curl
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME="${HOME:-/root}"

REPO="/var/www/Golden-Touch-1127-CA"
BRANCH="main"
LOG="/var/log/golden-touch-deploy.log"

cd "$REPO"

# Evitar que dos corridas se pisen (un build puede durar más de 3 min).
exec 9>/tmp/golden-touch-deploy.lock
flock -n 9 || exit 0

# ¿Hay algo nuevo en origin/main?
git fetch origin "$BRANCH" --quiet
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0   # sin cambios → no hacemos nada (ni marcamos)
fi

# Credenciales para la marca de despliegue (de .env.local / .env, gitignored).
if [ -f .env.local ]; then set -a; . ./.env.local; set +a; fi
if [ -f .env ]; then set -a; . ./.env; set +a; fi
SUPABASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"

# Anota en la base QUÉ commit quedó publicado y CUÁNDO, vía PostgREST.
# Nunca aborta el despliegue: si algo falla, lo escribe en el log y sigue.
marcar_despliegue() {
  # Si faltan credenciales lo DECIMOS en el log. Antes se salía en silencio: el
  # despliegue seguía igual, pero nadie podía notar que la marca no se estaba
  # escribiendo. Un fallo mudo en la única señal de despliegue no sirve.
  if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    echo "$(date '+%F %T') · MARCA OMITIDA: falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local" >> "$LOG"
    return 0
  fi
  # `updated_at` se escribe A MANO: la tabla no tiene trigger que lo mueva, así
  # que si no lo mandamos acá la fila queda congelada en la fecha de la última
  # edición manual y NO sirve para saber cuándo publicó el sitio por última vez
  # (fue exactamente lo que despistó el diagnóstico del cron roto).
  # `updated_by` deja el commit desplegado: la fila pasa a ser el registro de
  # «qué versión está publicada y desde cuándo».
  # `activo` va SIEMPRE en false: la columna quedó sin uso al retirar el banner,
  # y así, si alguna vez alguien la encendió a mano, el despliegue la apaga.
  local body ahora quien
  ahora="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  quien="deploy:${REMOTE:0:7}"
  body=$(printf '{"activo":false,"updated_at":"%s","updated_by":"%s"}' "$ahora" "$quien")
  # Se guarda el código HTTP y se registra si NO es 2xx. El despliegue continúa
  # igual (la marca es accesoria), pero el fallo queda escrito en vez de
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
    *) echo "$(date '+%F %T') · MARCA FALLÓ (HTTP $codigo)" >> "$LOG" ;;
  esac
}

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

# Con `set -e`, si el build falla el script corta antes de llegar acá: la marca
# se escribe solo cuando la versión nueva quedó realmente publicada.
marcar_despliegue
