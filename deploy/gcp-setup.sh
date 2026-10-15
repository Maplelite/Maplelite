#!/usr/bin/env bash
# Maplelite game server setup for a Google Cloud e2-micro VM (Debian 12 or Ubuntu 22.04+).
# Run on the VM:   curl -fsSLO https://raw.githubusercontent.com/xwesleyxchasex-tech/Maplelite/main/deploy/gcp-setup.sh && sudo bash gcp-setup.sh
# It installs Node 22 and Caddy, downloads the game server from the private repo with a read-only deploy key, runs it
# as a service that restarts on its own, puts free HTTPS in front (Caddy + a <your-ip>.sslip.io address), keeps the
# database on the VM's disk with a daily backup, and adds `sudo maplelite-update` to pull new versions.
# Safe to run again: it keeps the database and the admin password.
set -euo pipefail
REPO="git@github.com:xwesleyxchasex-tech/MapleLite-Alpha.git"
CORS_ORIGIN="${CORS_ORIGIN:-https://xwesleyxchasex-tech.github.io}"
APP=/opt/maplelite; DATA=/var/lib/maplelite; USR=maplelite; ENVF=/etc/maplelite.env
say(){ printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo bash $0"; exit 1; }

say "Installing packages"
apt-get update -qq
apt-get install -y -qq git curl ca-certificates gnupg sqlite3 debian-keyring debian-archive-keyring apt-transport-https >/dev/null
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".").map(Number).reduce((a,b,i)=>i<2?a*1000+b:a)')" -lt 22005 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "Node $(node -v)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi

say "Adding 1 GB of swap (the e2-micro has 1 GB of memory)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "Creating the maplelite user and folders"
id -u $USR >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin $USR
mkdir -p $DATA/backups && chown -R $USR:$USR $DATA
H=$(getent passwd $USR | cut -d: -f6); mkdir -p $H/.ssh; chown $USR:$USR $H/.ssh; chmod 700 $H/.ssh
if [ ! -f $H/.ssh/id_ed25519 ]; then sudo -u $USR ssh-keygen -q -t ed25519 -N "" -C "maplelite-server" -f $H/.ssh/id_ed25519; fi
ssh-keyscan -t ed25519 github.com 2>/dev/null > $H/.ssh/known_hosts; chown $USR:$USR $H/.ssh/known_hosts

if ! sudo -u $USR git ls-remote "$REPO" >/dev/null 2>&1; then
  say "Give this server read access to the private repo"
  echo "1. Open https://github.com/xwesleyxchasex-tech/MapleLite-Alpha/settings/keys/new"
  echo "2. Title: maplelite-server   Key: paste the line below   Leave 'Allow write access' OFF   Add key"
  echo; cat $H/.ssh/id_ed25519.pub; echo
  until sudo -u $USR git ls-remote "$REPO" >/dev/null 2>&1; do read -rp "Press Enter after adding the key (Ctrl+C to stop)... " _ </dev/tty; done
fi

say "Downloading the game server"
if [ -d $APP/.git ]; then sudo -u $USR git -C $APP pull -q --ff-only; else mkdir -p $APP && chown $USR:$USR $APP && sudo -u $USR git clone -q --depth 1 "$REPO" $APP; fi

if [ ! -f $ENVF ]; then
  say "Choose the admin password (account ID: user)"
  while :; do read -rsp "Admin password (8+ characters): " P1 </dev/tty; echo; read -rsp "Again: " P2 </dev/tty; echo
    [ ${#P1} -ge 8 ] && [ "$P1" = "$P2" ] && break; echo "Passwords must match and be at least 8 characters."; done
  umask 077; printf 'PORT=8080\nDB_PATH=%s/maplelite.db\nCORS_ORIGIN=%s\nADMIN_PASSWORD=%s\n' "$DATA" "$CORS_ORIGIN" "$P1" > $ENVF
  chown root:$USR $ENVF; chmod 640 $ENVF
fi

say "Starting the game server service"
cat > /etc/systemd/system/maplelite.service <<EOF
[Unit]
Description=Maplelite game server
After=network-online.target
[Service]
User=$USR
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=/usr/bin/node server/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DATA
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload; systemctl enable -q --now maplelite; systemctl restart maplelite

say "HTTPS address"
IP=$(curl -fs -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip || curl -fs https://api.ipify.org)
HOST="$(echo "$IP" | tr . -).sslip.io"
cat > /etc/caddy/Caddyfile <<EOF
$HOST {
  encode gzip
  reverse_proxy 127.0.0.1:8080
}
EOF
systemctl enable -q caddy; systemctl reload caddy || systemctl restart caddy

say "Daily database backup (03:30, keeps 14 days) and the update command"
cat > /usr/local/bin/maplelite-backup <<EOF
#!/bin/sh
[ -f $DATA/maplelite.db ] || exit 0
sqlite3 $DATA/maplelite.db ".backup '$DATA/backups/maplelite-\$(date +%F).db'"
find $DATA/backups -name 'maplelite-*.db' -mtime +14 -delete
EOF
chmod 755 /usr/local/bin/maplelite-backup
echo "30 3 * * * $USR /usr/local/bin/maplelite-backup" > /etc/cron.d/maplelite-backup
cat > /usr/local/bin/maplelite-update <<EOF
#!/bin/sh
# Pull the newest version from the private repo and restart. The database is not touched.
set -e
sudo -u $USR git -C $APP pull --ff-only
systemctl restart maplelite
echo "Updated to \$(cat $APP/VERSION). Server restarted."
EOF
chmod 755 /usr/local/bin/maplelite-update

sleep 2
if curl -fs http://127.0.0.1:8080/healthz >/dev/null; then OK=running; else OK="NOT running - check: sudo journalctl -u maplelite -n 50"; fi
say "Done"
echo "Game server: $OK"
echo "Server URL:  https://$HOST   (HTTPS can take a minute the first time)"
echo "Check:       https://$HOST/healthz   should show {\"ok\":true}"
echo "Admin login: user / the password you chose"
echo "Update:      sudo maplelite-update      Logs: sudo journalctl -u maplelite -f"
echo "Send the Server URL to Claude so the public site can point at it."
