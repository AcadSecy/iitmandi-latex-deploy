#!/usr/bin/env bash
# Nightly backup of IIT Mandi LaTeX running on the Toolkit.
#
#  1. Flush edits that are still in Redis (document updater, project history)
#     so that the database and history store are up to date.
#  2. Dump MongoDB with --oplog, which makes the dump consistent at one point
#     in time while the platform keeps running.
#  3. Store the dump, the app data directory (without compile output and
#     caches), git-bridge data, the Toolkit config and the TeX Live image
#     archives in an off-host restic repository (encrypted and deduplicated,
#     so an unchanged image archive is uploaded once), then keep one snapshot
#     per day for KEEP_DAILY days.
#
# Settings are read from /etc/iitmandi-latex/backup.env (see backup.env.example).
# Run as root: the data directories belong to root.

set -Eeuo pipefail

CONFIG_FILE=${BACKUP_CONFIG_FILE:-/etc/iitmandi-latex/backup.env}
if [[ -f $CONFIG_FILE ]]; then
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
fi

: "${TOOLKIT_DIR:=/opt/iitmandi-latex/toolkit}"
: "${STAGING_DIR:=/var/backups/iitmandi-latex}"
: "${KEEP_DAILY:=7}"
: "${IMAGES_DIR:=/srv/iitmandi-latex/images}"
: "${APP_CONTAINER:=sharelatex}"
: "${MONGO_CONTAINER:=mongo}"
: "${RESTIC_REPOSITORY:?set RESTIC_REPOSITORY in $CONFIG_FILE}"
: "${RESTIC_PASSWORD_FILE:?set RESTIC_PASSWORD_FILE in $CONFIG_FILE}"
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE

log() { printf '%s %s\n' "$(date -Is)" "$*"; }
fail() {
  log "ERROR: $*"
  exit 1
}
trap 'fail "line $LINENO: $BASH_COMMAND exited with status $?"' ERR

# A path setting from the Toolkit's config/overleaf.rc, relative to TOOLKIT_DIR
# unless it is absolute.
toolkit_path() {
  local key=$1 default=$2 value
  value=$(sed -n "s/^${key}=//p" "$TOOLKIT_DIR/config/overleaf.rc" | tail -n 1 | tr -d "\"'")
  value=${value:-$default}
  [[ $value == /* ]] || value="$TOOLKIT_DIR/$value"
  printf '%s\n' "$value"
}

# Run a command inside the app container with its service environment loaded.
in_app() {
  docker exec "$APP_CONTAINER" /bin/bash -c \
    "source /etc/container_environment.sh && source /etc/overleaf/env.sh && $1"
}

[[ -f $TOOLKIT_DIR/config/overleaf.rc ]] || fail "no Toolkit config in $TOOLKIT_DIR/config"
command -v restic >/dev/null || fail "restic is not installed"
command -v docker >/dev/null || fail "docker is not installed"

APP_DATA=$(toolkit_path OVERLEAF_DATA_PATH data/overleaf)
GIT_BRIDGE_DATA=$(toolkit_path GIT_BRIDGE_DATA_PATH data/git-bridge)
[[ -d $APP_DATA ]] || fail "app data directory $APP_DATA not found"

mkdir -p "$STAGING_DIR"
chmod 700 "$STAGING_DIR"
exec 9>"$STAGING_DIR/.lock"
flock -n 9 || fail "another backup is still running"

started=$(date +%s)
log "backup started"

log "flushing pending edits"
in_app 'cd /overleaf/services/document-updater && /sbin/setuser www-data node scripts/flush_all.js' >/dev/null \
  || log "WARNING: document updater flush failed; edits from the last few minutes may be missing"
in_app 'cd /overleaf/services/project-history && /sbin/setuser www-data node scripts/flush_all.js 100000' >/dev/null \
  || log "WARNING: project history flush failed; the latest history entries may be missing"

dump="$STAGING_DIR/mongo.archive"
rm -f "$dump"
log "dumping MongoDB"
if ! docker exec "$MONGO_CONTAINER" mongodump --quiet --oplog --archive >"$dump"; then
  # --oplog needs a replica set, which the Toolkit configures by default
  log "WARNING: mongodump --oplog failed, retrying without it (dump may be inconsistent)"
  docker exec "$MONGO_CONTAINER" mongodump --quiet --archive >"$dump"
fi
[[ -s $dump ]] || fail "MongoDB dump is empty"

paths=("$dump" "$APP_DATA" "$TOOLKIT_DIR/config")
[[ -d $GIT_BRIDGE_DATA ]] && paths+=("$GIT_BRIDGE_DATA")
# TeX Live images (deploy/iitmandi/texlive), so a new server compiles the same
[[ -d $IMAGES_DIR ]] && paths+=("$IMAGES_DIR")

log "uploading to $RESTIC_REPOSITORY"
restic backup --quiet --tag iitmandi-latex \
  --exclude "$APP_DATA/data/compiles" \
  --exclude "$APP_DATA/data/output" \
  --exclude "$APP_DATA/data/cache" \
  --exclude "$APP_DATA/tmp" \
  --exclude "$IMAGES_DIR/*.partial" \
  "${paths[@]}"

log "keeping the last $KEEP_DAILY daily snapshots"
restic forget --quiet --tag iitmandi-latex --keep-daily "$KEEP_DAILY" --prune

# Read back a sample of the stored data once a week
if [[ $(date +%u) == 7 ]]; then
  log "checking 5% of the repository data"
  restic check --read-data-subset=5%
fi

rm -f "$dump"

if [[ -n ${HEALTHCHECK_URL:-} ]]; then
  curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL" >/dev/null || log "WARNING: health check ping failed"
fi

log "backup finished in $(($(date +%s) - started))s"
