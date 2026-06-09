# Auto-deploy en el Droplet (cron cada ≤3 min)

`auto-update.sh` revisa `origin/main` y, **solo si avanzó**, hace `reset --hard` + `npm ci` +
`build` + `reload nginx`. Pensado para correr por cron como `root`.

## 1. Que `git fetch` no pida contraseña en cron (repo privado)
Una sola vez, en el server, guardá el token de `Mgg-Sistemas`:
```bash
cd /var/www/Golden-Touch-1127-CA
git config credential.helper store
git fetch origin main      # usuario: Mgg-Sistemas · password: el token ghp_...
```
El token queda en `~/.git-credentials` (root, fuera del repo).

## 2. Permisos del script
```bash
chmod +x /var/www/Golden-Touch-1127-CA/deploy/auto-update.sh
touch /var/log/golden-touch-deploy.log
```

## 3. Instalar el cron (cada 3 minutos)
```bash
crontab -e
```
Agregá esta línea:
```
*/3 * * * * /var/www/Golden-Touch-1127-CA/deploy/auto-update.sh
```

## 4. Verificar
```bash
# forzar una corrida manual
/var/www/Golden-Touch-1127-CA/deploy/auto-update.sh
# ver el log
tail -f /var/log/golden-touch-deploy.log
# ver que el cron quedó cargado
crontab -l
```

> Nota: el primer `git pull`/clone ya tiene que estar hecho (ver guía del Droplet).
> Si querés probar el flujo, pusheá un cambio a `main` y en ≤3 min debería verse en el sitio.
