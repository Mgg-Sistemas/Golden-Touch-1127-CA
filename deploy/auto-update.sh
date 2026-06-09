#!/usr/bin/env bash
# ============================================================
#  Auto-deploy de Golden Touch 1127 CA en el Droplet.
#  Corre por cron cada <=3 min. Solo reconstruye si main avanzó.
#  Instalación: ver deploy/README-deploy.md
# ============================================================
set -euo pipefail

# cron arranca con PATH mínimo: aseguramos node/npm/git/systemctl
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
  exit 0   # sin cambios → no hacemos nada
fi

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
