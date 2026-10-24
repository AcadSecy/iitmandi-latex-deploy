#!/bin/bash
# One-time setup of the Raspberry Pi for the IIT Mandi LaTeX test deployment.
# Safe to run again: it never replaces the secrets or touches existing data.
#
#   sudo bash deploy/pi/setup.sh [user that runs pi-deploy, default tayalji]
#
# Makes /srv/iitmandi-latex (data folders, and the compose folder that
# pi-deploy fills on every deploy) and the two secrets. pi-deploy does the
# rest: it pulls the image built by GitHub Actions for each commit on the
# staging branch and starts it.
set -euo pipefail

DEPLOY_USER=${1:-tayalji}
ROOT=/srv/iitmandi-latex

if [ "$(id -u)" != 0 ]; then
  echo "Run as root (sudo)" >&2
  exit 1
fi

mkdir -p "$ROOT/data/app" "$ROOT/data/mongo" "$ROOT/data/redis" "$ROOT/compose"
chown "$DEPLOY_USER:$DEPLOY_USER" "$ROOT/compose"
chmod 700 "$ROOT/compose"

# Compile files live in RAM (docker-compose.yml): two RAM disks of the host,
# which the compile containers see too. In /etc/fstab, so that they are back
# after a reboot before Docker starts the platform. www-data is uid 33.
for disk in compiles:1536m output:768m; do
  dir="$ROOT/data/app/data/${disk%%:*}"
  mkdir -p "$dir"
  if ! grep -qs " $dir tmpfs " /etc/fstab; then
    echo "tmpfs $dir tmpfs size=${disk#*:},uid=33,gid=33,mode=0755,nosuid,nodev 0 0" >> /etc/fstab
    echo "added $dir to /etc/fstab"
  fi
done
systemctl daemon-reload
for dir in "$ROOT/data/app/data/compiles" "$ROOT/data/app/data/output"; do
  mountpoint -q "$dir" || mount "$dir"
done

# Never regenerate: a new invite secret breaks every share link, a new
# session secret logs everyone out.
SECRETS="$ROOT/compose/secrets.env"
if [ ! -s "$SECRETS" ]; then
  umask 077
  {
    echo "# Made by setup.sh on $(date -I). Never change these; keep a copy offline."
    echo "OVERLEAF_INVITE_TOKEN_SECRET=$(openssl rand -hex 32)"
    echo "OVERLEAF_SESSION_SECRET=$(openssl rand -hex 32)"
  } > "$SECRETS"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$SECRETS"
  echo "made $SECRETS"
else
  echo "kept $SECRETS"
fi

df -h "$ROOT"
echo "Ready. pi-deploy deploys the next image of the staging branch."
