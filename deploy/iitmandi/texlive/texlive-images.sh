#!/usr/bin/env bash
# Installs the TeX Live images that compiles run in, as pinned in images.txt,
# and keeps an archive of each so that compiles never depend on Docker Hub.
#
#   texlive-images.sh install [NAME...]  install missing images: from the
#                                        archive if there is one, else pulled
#                                        by digest, checked and archived
#   texlive-images.sh check [NAME...]    compile a test document with pdflatex,
#                                        xelatex and lualatex in each image
#   texlive-images.sh save [NAME...]     (re)write the archive of an image
#   texlive-images.sh load [NAME...]     load images from their archives
#   texlive-images.sh fetch [NAME...]    only pull by digest and tag (for CI)
#   texlive-images.sh list               show what is installed and archived
#
# NAME is a local name from images.txt, e.g. iitmandi/texlive:2026.1; without
# names, every image in the file. Run as root, or as a user in the docker group.
#
# Settings (environment):
#   IMAGES_DIR   where the archives are kept (default /srv/iitmandi-latex/images,
#                which the nightly backup includes)
#   IMAGES_FILE  the pin file (default: images.txt next to this script)
set -euo pipefail

IMAGES_DIR=${IMAGES_DIR:-/srv/iitmandi-latex/images}
IMAGES_FILE=${IMAGES_FILE:-$(dirname "$(readlink -f "$0")")/images.txt}

log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }
fail() {
  log "ERROR: $*" >&2
  exit 1
}

command -v docker >/dev/null || fail "docker is not installed"
[[ -r $IMAGES_FILE ]] || fail "cannot read $IMAGES_FILE"

# "name source year" for each image line of images.txt
pinned() { grep -Ev '^[[:space:]]*(#|$)' "$IMAGES_FILE"; }

# The pinned line of an image, or nothing
lookup() { pinned | awk -v name="$1" '$1 == name'; }

# Images named on the command line, or all of them
selected() {
  if (($# == 0)); then
    pinned | awk '{print $1}'
    return
  fi
  local name
  for name in "$@"; do
    [[ -n $(lookup "$name") ]] || fail "$name is not in $IMAGES_FILE"
    echo "$name"
  done
}

archive_of() { echo "$IMAGES_DIR/${1//[\/:]/-}.tar.gz"; }

installed() { docker image inspect "$1" >/dev/null 2>&1; }

# Compiles a small document with each engine, as the compile service does:
# no network, an unprivileged user, latexmk.
check() {
  local name=$1 year
  year=$(lookup "$name" | awk '{print $3}')
  log "checking $name"
  local version
  version=$(docker run --rm --network none "$name" pdftex --version | head -n 1)
  log "  $version"
  [[ $version == *"TeX Live $year"* ]] ||
    fail "$name should be TeX Live $year, see images.txt"
  docker run --rm --network none --user 33:33 \
    --tmpfs /work:rw,exec,uid=33,gid=33 --workdir /work --env HOME=/tmp \
    "$name" sh -c '
      printf "%s\n" "\\documentclass{article}" "\\usepackage{tikz}" \
        "\\begin{document}" "Check \\tikz \\draw (0,0) circle (1ex);" \
        "\\end{document}" > check.tex
      for engine in pdf xelatex lualatex; do
        latexmk -$engine -interaction=batchmode -jobname=check-$engine check.tex \
          >/dev/null 2>&1 && [ -s check-$engine.pdf ] || {
            echo "$engine failed"; tail -n 20 check-$engine.log; exit 1; }
      done' || fail "$name cannot compile"
  log "  pdflatex, xelatex and lualatex compile"
}

save() {
  local name=$1 archive
  archive=$(archive_of "$name")
  installed "$name" || fail "$name is not installed"
  mkdir -p "$IMAGES_DIR"
  log "saving $name to $archive (a few minutes)"
  # --rsyncable keeps the nightly restic backup from uploading it again
  docker save "$name" | gzip --rsyncable >"$archive.partial"
  (cd "$IMAGES_DIR" && sha256sum "$(basename "$archive.partial")" |
    sed 's/\.partial$//' >"$(basename "$archive").sha256")
  mv "$archive.partial" "$archive"
  log "  $(du -h "$archive" | cut -f1)"
}

load() {
  local name=$1 archive
  archive=$(archive_of "$name")
  [[ -f $archive && -f $archive.sha256 ]] || fail "no archive of $name in $IMAGES_DIR"
  log "verifying $archive"
  (cd "$IMAGES_DIR" && sha256sum --check --quiet "$(basename "$archive").sha256") ||
    fail "$archive is damaged; restore it from the backup or pull again"
  log "loading $name"
  docker load --input "$archive" >/dev/null
  installed "$name" || fail "$archive does not contain $name"
}

# Pulls the pinned bytes from Docker Hub and gives them the local name
fetch() {
  local name=$1 source by_digest
  source=$(lookup "$name" | awk '{print $2}')
  # texlive/texlive:latest-full@sha256:... -> texlive/texlive@sha256:...
  by_digest="${source%%[:@]*}@${source##*@}"
  log "pulling $by_digest"
  docker pull --quiet "$by_digest" >/dev/null
  docker tag "$by_digest" "$name"
  # keep only the local name
  docker rmi "$by_digest" >/dev/null 2>&1 || true
}

install() {
  local name=$1
  if installed "$name"; then
    log "$name is installed"
    [[ -f $(archive_of "$name") ]] || save "$name"
    return
  fi
  if [[ -f $(archive_of "$name") ]]; then
    load "$name"
  else
    fetch "$name"
  fi
  check "$name"
  [[ -f $(archive_of "$name") ]] || save "$name"
}

list() {
  local name source year archive state
  printf '%-26s %-10s %-9s %s\n' IMAGE TEXLIVE INSTALLED ARCHIVE
  while read -r name source year; do
    archive=$(archive_of "$name")
    state=no
    installed "$name" && state=yes
    if [[ -f $archive ]]; then
      archive="$(du -h "$archive" | cut -f1) $archive"
    else
      archive="none"
    fi
    printf '%-26s %-10s %-9s %s\n' "$name" "$year" "$state" "$archive"
  done < <(pinned)
}

command=${1:-}
shift || true
mkdir -p "$IMAGES_DIR"
exec 9>"$IMAGES_DIR/.lock"
flock -n 9 || fail "another texlive-images.sh is running"

case $command in
  install | check | save | load | fetch)
    names=$(selected "$@")
    for name in $names; do
      "$command" "$name"
    done
    ;;
  list) list ;;
  *)
    sed -n '2,/^set -euo/p' "$0" | sed '$d'
    exit 2
    ;;
esac
