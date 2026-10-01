#!/usr/bin/env bash
# Restore IIT Mandi LaTeX from a snapshot made by backup.sh.
#
#   restore.sh [SNAPSHOT] [--yes]     SNAPSHOT defaults to "latest"
#
# Stops the platform, replaces the app data directory, git-bridge data and
# the MongoDB contents with the snapshot, empties Redis, and starts the platform
# again. Compile output and caches are not in backups; they are rebuilt on the
# next compile. Users have to log in again afterwards.
#
# The Toolkit config is restored next to the staging directory for comparison,
# not over the live config.

set -Eeuo pipefail

CONFIG_FILE=${BACKUP_CONFIG_FILE:-/etc/iitmandi-latex/backup.env}
if [[ -f $CONFIG_FILE ]]; then
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
fi

: "${TOOLKIT_DIR:=/opt/iitmandi-latex/toolkit}"
: "${STAGING_DIR:=/var/backups/iitmandi-latex}"
: "${RESTORE_DIR:=$STAGING_DIR}"
: "${MONGO_CONTAINER:=mongo}"
: "${REDIS_CONTAINER:=redis}"
: "${RESTIC_REPOSITORY:?set RESTIC_REPOSITORY in $CONFIG_FILE}"
: "${RESTIC_PASSWORD_FILE:?set RESTIC_PASSWORD_FILE in $CONFIG_FILE}"
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE

log() { printf '%s %s\n' "$(date -Is)" "$*"; }
fail() {
  log "ERROR: $*"
  exit 1
}
trap 'fail "line $LINENO: $BASH_COMMAND exited with status $?"' ERR

toolkit_path() {
  local key=$1 default=$2 value
  value=$(sed -n "s/^${key}=//p" "$TOOLKIT_DIR/config/overleaf.rc" | tail -n 1 | tr -d "\"'")
  value=${value:-$default}
  [[ $value == /* ]] || value="$TOOLKIT_DIR/$value"
  printf '%s\n' "$value"
}

snapshot=latest
assume_yes=false
for arg in "$@"; do
  case $arg in
    --yes) assume_yes=true ;;
    -*) fail "unknown option $arg" ;;
    *) snapshot=$arg ;;
  esac
done

[[ -f $TOOLKIT_DIR/config/overleaf.rc ]] || fail "no Toolkit config in $TOOLKIT_DIR/config"
APP_DATA=$(toolkit_path OVERLEAF_DATA_PATH data/overleaf)
GIT_BRIDGE_DATA=$(toolkit_path GIT_BRIDGE_DATA_PATH data/git-bridge)

if [[ $snapshot == latest ]]; then
  restic snapshots --tag iitmandi-latex --latest 1
else
  restic snapshots --tag iitmandi-latex "$snapshot"
fi || fail "snapshot $snapshot not found"

if [[ $assume_yes != true ]]; then
  echo "This stops the platform and REPLACES all current projects, users and files"
  echo "with snapshot '$snapshot'. Changes made since that snapshot are lost."
  read -r -p "Type 'restore' to continue: " answer
  [[ $answer == restore ]] || fail "aborted"
fi

mkdir -p "$RESTORE_DIR"
work=$(mktemp -d "$RESTORE_DIR/restore.XXXXXX")
log "restoring snapshot $snapshot into $work"
restic restore "$snapshot" --tag iitmandi-latex --target "$work"

dump="$work$STAGING_DIR/mongo.archive"
[[ -s $dump ]] || fail "the snapshot has no MongoDB dump at $STAGING_DIR/mongo.archive"
[[ -d $work$APP_DATA ]] || fail "the snapshot has no app data at $APP_DATA"

log "stopping the platform"
"$TOOLKIT_DIR/bin/stop"

log "restoring files"
# Excluded paths were not backed up, so keep whatever is there
rsync -a --delete \
  --exclude /data/compiles --exclude /data/output --exclude /data/cache --exclude /tmp \
  "$work$APP_DATA/" "$APP_DATA/"
if [[ -d $work$GIT_BRIDGE_DATA ]]; then
  rsync -a --delete "$work$GIT_BRIDGE_DATA/" "$GIT_BRIDGE_DATA/"
fi

log "starting MongoDB and Redis"
"$TOOLKIT_DIR/bin/docker-compose" up -d mongo redis
for _ in $(seq 60); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$MONGO_CONTAINER" 2>/dev/null || true)
  [[ $status == healthy ]] && break
  sleep 2
done
[[ $status == healthy ]] || fail "MongoDB did not become healthy"

# Redis holds sessions and unflushed edits newer than the snapshot; replaying
# those onto the restored database would corrupt projects.
log "emptying Redis"
docker exec "$REDIS_CONTAINER" redis-cli FLUSHALL >/dev/null

log "restoring MongoDB"
if ! docker exec -i "$MONGO_CONTAINER" mongorestore --quiet --drop --oplogReplay --archive <"$dump"; then
  log "WARNING: restore with --oplogReplay failed, retrying without it"
  docker exec -i "$MONGO_CONTAINER" mongorestore --quiet --drop --archive <"$dump"
fi

log "starting the platform"
"$TOOLKIT_DIR/bin/start"

if [[ -d $work$TOOLKIT_DIR/config ]]; then
  config_copy="$RESTORE_DIR/restored-config-$(date +%Y%m%d-%H%M%S)"
  mv "$work$TOOLKIT_DIR/config" "$config_copy"
  log "the snapshot's Toolkit config is in $config_copy for comparison"
fi
rm -rf "$work"
log "restore finished"
