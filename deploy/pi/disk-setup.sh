#!/bin/bash
# Put the test platform on a disk of its own (a USB stick or an external drive),
# with a Docker of its own on it, so that its images and data never touch the
# Pi's card or the other apps. Run on the Pi, as root, from a checkout of this
# folder:
#
#   sudo FORMAT=yes bash disk-setup.sh /dev/sdX [user that runs pi-deploy]
#
# ERASES the whole disk. What /srv/iitmandi-latex holds now (secrets, data,
# and the platform's Docker with its images) is copied onto the disk first. A
# folder on the card is kept beside it as /srv/iitmandi-latex.card-<time>; an
# earlier disk (moving from the stick to a bigger one) is unmounted, untouched.
# Run setup.sh before this, once.
set -euo pipefail

DEV=${1:?usage: sudo FORMAT=yes bash disk-setup.sh /dev/sdX [user]}
DEPLOY_USER=${2:-tayalji}
ROOT=/srv/iitmandi-latex
HERE=$(cd "$(dirname "$0")" && pwd)

[ "$(id -u)" = 0 ] || { echo "Run as root (sudo)" >&2; exit 1; }
[ -b "$DEV" ] && [ "$(lsblk -dno TYPE "$DEV")" = disk ] || { echo "$DEV is not a disk" >&2; exit 1; }
if lsblk -lno MOUNTPOINT "$DEV" | grep -qxE '/|/boot.*'; then
  echo "$DEV holds the running system: refusing" >&2
  exit 1
fi
if [ "${FORMAT:-}" != yes ]; then
  echo "This erases $DEV: $(lsblk -dno SIZE,MODEL "$DEV"). Run again with FORMAT=yes." >&2
  lsblk -o NAME,SIZE,FSTYPE,LABEL "$DEV" >&2
  exit 1
fi

# 1. One ext4 partition over the whole disk
systemctl stop docker-latex 2>/dev/null || true
for p in $(lsblk -lnpo NAME "$DEV" | tail -n +2); do umount "$p" 2>/dev/null || true; done
wipefs -aq "$DEV"
echo 'type=83' | sfdisk -q "$DEV"
udevadm settle
PART=$(lsblk -lnpo NAME,TYPE "$DEV" | awk '$2 == "part" {print $1; exit}')
mkfs.ext4 -q -F -L iitmandi-latex "$PART"
UUID=$(blkid -s UUID -o value "$PART")
echo "formatted $PART (UUID $UUID)"

# 2. Mount it at /srv/iitmandi-latex, with what was there
for d in compiles output; do
  if mountpoint -q "$ROOT/data/app/data/$d"; then umount "$ROOT/data/app/data/$d"; fi
done
NEW=/mnt/iitmandi-latex-new
mkdir -p "$NEW"
mount "$PART" "$NEW"
if [ -d "$ROOT" ]; then rsync -aHAX "$ROOT/" "$NEW/"; fi
umount "$NEW"
rmdir "$NEW"
if mountpoint -q "$ROOT"; then
  # moving from an earlier disk (the stick to a bigger one): it is kept as it was
  umount "$ROOT"
elif [ -d "$ROOT" ]; then
  mv "$ROOT" "$ROOT.card-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "$ROOT"

# The disk first, then the compile RAM disks inside it (setup.sh made them):
# mount -a goes in file order. nofail: the Pi boots without the disk, and
# docker-latex then stays down instead of writing to the card.
TMPFS=$(grep " $ROOT/data/app/data/.* tmpfs " /etc/fstab || true)
sed -i "\# $ROOT/#d; \# $ROOT ext4 #d" /etc/fstab
echo "UUID=$UUID $ROOT ext4 defaults,noatime,nofail,x-systemd.device-timeout=10s 0 2" >> /etc/fstab
[ -n "$TMPFS" ] && echo "$TMPFS" >> /etc/fstab
systemctl daemon-reload
mount "$ROOT"
mount -a
chown "$DEPLOY_USER:$DEPLOY_USER" "$ROOT/compose"

# 3. A Docker of its own, keeping its images and containers on the disk
install -m 644 "$HERE/docker-latex/daemon.json" /etc/docker/latex-daemon.json
install -m 644 "$HERE/docker-latex/docker-latex.service" /etc/systemd/system/docker-latex.service
systemctl daemon-reload
systemctl enable --now docker-latex
# The app container starts sandboxed compiles through this Docker's socket
ENV="$ROOT/compose/.env"
touch "$ENV" && chown "$DEPLOY_USER:$DEPLOY_USER" "$ENV"
grep -q '^LATEX_DOCKER_SOCKET=' "$ENV" || echo 'LATEX_DOCKER_SOCKET=/run/docker-latex.sock' >> "$ENV"

df -h "$ROOT"
DOCKER_HOST=unix:///run/docker-latex.sock docker info --format 'docker-latex: {{.Driver}} in {{.DockerRootDir}}'
