#!/usr/bin/env bash
#
# Auto-deploy del Droplet (DigitalOcean) por crontab.
#
# Hace pull de la rama, y SOLO reconstruye cuando hay cambios nuevos:
#   - si no hay commits nuevos -> sale en milisegundos (no compila).
#   - si cambia package-lock.json -> npm ci; si no, salta la instalacion.
#   - flock evita que dos corridas del cron se pisen.
#
# AJUSTA estas 3 variables UNA sola vez segun tu Droplet:
APP_DIR="/var/www/golden-touch"        # carpeta donde clonaste el repo
WEB_ROOT="/var/www/golden-touch/dist"  # carpeta que sirve nginx (puede ser el mismo dist)
BRANCH="main"

set -euo pipefail
LOCK="/tmp/gt-deploy.lock"
LOG="/var/log/gt-deploy.log"

# Evita corridas solapadas: si ya hay un deploy en curso, sale.
exec 9>"$LOCK"
flock -n 9 || exit 0

cd "$APP_DIR"

# Trae lo ultimo SIN construir todavia.
git fetch origin "$BRANCH" --quiet
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

# Nada nuevo -> termina rapidisimo (este es el caso comun cada minuto).
if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

echo "$(date '+%F %T') nuevo commit $REMOTE, desplegando..." >> "$LOG"

# Reinstala dependencias SOLO si cambio el lockfile (lo lento).
NEED_INSTALL="no"
if ! git diff --quiet "$LOCAL" "$REMOTE" -- package-lock.json; then
  NEED_INSTALL="si"
fi

git reset --hard "$REMOTE"

if [ "$NEED_INSTALL" = "si" ]; then
  echo "$(date '+%F %T') package-lock cambio, npm ci..." >> "$LOG"
  npm ci
fi

# Build (Vite). Con base '/', igual que el workflow.
VITE_BASE_PATH=/ npm run build

# Si nginx sirve una carpeta distinta a APP_DIR/dist, sincronizala.
if [ "$WEB_ROOT" != "$APP_DIR/dist" ]; then
  rsync -a --delete "$APP_DIR/dist/" "$WEB_ROOT/"
fi

sudo systemctl reload nginx || true
echo "$(date '+%F %T') OK desplegado $REMOTE" >> "$LOG"
