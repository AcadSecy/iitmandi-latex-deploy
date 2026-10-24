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
