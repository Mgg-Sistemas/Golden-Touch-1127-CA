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

# ÚLTIMO DESPLIEGUE QUE TERMINÓ BIEN (12/10/2026). Antes se comparaba solo HEAD con
# origin/main: si el build fallaba (p. ej. Node sin memoria), HEAD ya había avanzado con
# el reset y las corridas siguientes creían que no había nada nuevo. El sitio quedaba en
# la versión vieja hasta el próximo commit. Ahora se reintenta hasta que publique.
OK_FILE="/var/lib/golden-touch/ultimo-deploy-ok"
mkdir -p "$(dirname "$OK_FILE")"
ULTIMO_OK="$(cat "$OK_FILE" 2>/dev/null || true)"
# Primera corrida con esta lógica: si lo publicado ya es este commit, solo se anota.
if [ -z "$ULTIMO_OK" ] && [ "$LOCAL" = "$REMOTE" ] && grep -q "${REMOTE:0:7}" dist/version.json 2>/dev/null; then
  echo "$REMOTE" > "$OK_FILE"
  ULTIMO_OK="$REMOTE"
fi

if [ "$LOCAL" = "$REMOTE" ] && [ "$ULTIMO_OK" = "$REMOTE" ]; then
  exit 0   # sin cambios y ya publicado → no hacemos nada (ni marcamos)
fi

# TOPE DE REINTENTOS POR COMMIT (25/10/2026). Un commit con un error de tipos (tsc -b) se
# reintentaba cada 6 min para siempre: el sitio estuvo ~40 h sin publicar y, como el Droplet
# tiene UN solo procesador, cada intento lo dejaba al 100 % durante minutos (el sistema
# entero se sentía lento: HTML en 3 s y los JS en más de 10 s). Ahora cada commit se intenta
# como máximo MAX_FALLOS veces; si falla, se deja de insistir hasta que main cambie (un
# commit nuevo reinicia la cuenta). El reintento sigue sirviendo para fallos pasajeros
# (p. ej. Node sin memoria), que se resuelven en el segundo o tercer intento.
MAX_FALLOS=3
FALLO_FILE="/var/lib/golden-touch/fallos-build"
FALLOS=0
if [ -f "$FALLO_FILE" ] && [ "$(cut -d' ' -f1 "$FALLO_FILE")" = "$REMOTE" ]; then
  FALLOS="$(cut -d' ' -f2 "$FALLO_FILE")"
fi
if [ "$FALLOS" -ge "$MAX_FALLOS" ]; then
  exit 0   # este commit ya falló MAX_FALLOS veces: no se reintenta hasta que main cambie
fi
registrar_fallo() {
  FALLOS=$((FALLOS + 1))
  echo "$REMOTE $FALLOS" > "$FALLO_FILE"
  if [ "$FALLOS" -ge "$MAX_FALLOS" ]; then
    echo "$(date '+%F %T') · BUILD FALLÓ $FALLOS veces en ${REMOTE:0:7}: se detienen los reintentos hasta que main tenga un commit nuevo (revisar los errores de arriba)" >> "$LOG"
  fi
}
trap registrar_fallo ERR

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
  if [ "$LOCAL" = "$REMOTE" ]; then
    echo "$(date '+%F %T') · reintento: el build de ${REMOTE:0:7} no había terminado (último publicado: ${ULTIMO_OK:0:7})"
  else
    echo "$(date '+%F %T') · cambios: ${LOCAL:0:7} -> ${REMOTE:0:7}"
  fi
  # .env.local / node_modules / dist están en .gitignore → reset no los borra
  git reset --hard "origin/$BRANCH"
  # `npm ci` tarda ~3 min en el Droplet: se corre solo si cambió package.json o el
  # lock (o si no hay node_modules). Si no cambiaron, node_modules ya es exactamente
  # lo que pide package-lock.json y reinstalarlo solo alarga el despliegue.
  BASE="${ULTIMO_OK:-$LOCAL}"
  if [ ! -d node_modules ] || ! git diff --quiet "$BASE" "$REMOTE" -- package.json package-lock.json 2>/dev/null; then
    nice -n 19 npm ci
  else
    echo "$(date '+%F %T') · npm ci omitido (package.json y package-lock.json sin cambios)"
  fi
  # VITE_APP_VERSION fijada al commit EXACTO desplegado: así version.json = commit y el
  # aviso "el sistema se actualizó" solo aparece cuando main avanzó de verdad (nunca por
  # un rebuild del mismo código). Este script ya solo construye cuando hay commit nuevo.
  #
  # SE CONSTRUYE EN dist.new Y SE CAMBIA DE UN GOLPE. Vite vacía la carpeta de salida al
  # arrancar: construyendo directo en dist/, el sitio quedaba SIN index.html durante todo
  # el build (~2 min; nginx: «open() .../dist/index.html failed», 18/09/2026 00:16 UTC),
  # es decir, cada despliegue tumbaba el sistema un rato. Con el rename, lo publicado
  # pasa de la versión vieja a la nueva en un instante y sin huecos.
  rm -rf dist.new
  # nice/ionice: el build corre con la prioridad más baja para que, mientras compila, el
  # Droplet (1 procesador) siga sirviendo el sitio a los usuarios sin trabarse.
  PRIO="nice -n 19"
  if command -v ionice >/dev/null 2>&1; then PRIO="$PRIO ionice -c3"; fi
  VITE_BASE_PATH=/ VITE_APP_VERSION="$(git rev-parse --short HEAD)" $PRIO npm run build -- --outDir dist.new
  rm -rf dist.old
  if [ -d dist ]; then mv dist dist.old; fi
  mv dist.new dist
  rm -rf dist.old
  systemctl reload nginx
  echo "$REMOTE" > "$OK_FILE"
  rm -f "$FALLO_FILE"
  echo "$(date '+%F %T') · deploy OK en ${REMOTE:0:7}"
} >> "$LOG" 2>&1

# Con `set -e`, si el build falla el script corta antes de llegar acá: la marca
# se escribe solo cuando la versión nueva quedó realmente publicada.
marcar_despliegue
