#!/bin/bash
# Run inside the Pi image (CI does, before the image is published): compiles
# every IIT Mandi template the way the compile service does, as the app's user,
# and checks that TeX cannot read files outside the compile folders.
#
#   check-tex.sh LIST
#
# LIST has one "id compiler main-file" line per template, with each template in
# /var/lib/overleaf/data/compiles/<id> (see the workflow).
set -uo pipefail

LIST=${1:?usage: check-tex.sh LIST}
ROOT=/var/lib/overleaf/data/compiles
status=0

echo "openin_any for the app's user: $(/sbin/setuser www-data kpsewhich -var-value=openin_any)"
echo "$(biber --version 2>&1 | head -n 1)"

compile() { # dir compiler main
  local flag
  case "$2" in
    xelatex) flag=-xelatex ;;
    lualatex) flag=-lualatex ;;
    *) flag=-pdf ;;
  esac
  # The compile service's command (services/clsi/app/js/LatexRunner.js)
  (cd "$1" && /sbin/setuser www-data latexmk -cd -jobname=output -auxdir="$1" -outdir="$1" \
    -synctex=1 -interaction=batchmode -f "$flag" "$1/$3" > build.log 2>&1 < /dev/null)
}

while read -r id compiler main; do
  dir="$ROOT/$id"
  compile "$dir" "$compiler" "$main"
  if [ -s "$dir/output.pdf" ] && ! grep -qE "^! |There were undefined references|(Citation|Reference) .* undefined" "$dir/output.log"; then
    echo "ok   $id $compiler $main"
  else
    echo "FAIL $id $compiler $main"
    grep -A3 -E "^! " "$dir/output.log" | head -n 20
    tail -n 20 "$dir/build.log"
    status=1
  fi
done < "$LIST"

# Without the per-compile sandbox, openin_any=p must keep TeX inside the
# compile folders: an absolute path elsewhere is refused
dir="$ROOT/read-outside"
mkdir -p "$dir"
printf '%s\n' '\documentclass{article}' '\begin{document}' '\input{/etc/passwd}' '\end{document}' > "$dir/main.tex"
chown -R www-data:www-data "$dir"
compile "$dir" pdflatex main.tex
# Refused, the file is "not found" and the job stops without a PDF; read, its
# lines are typeset onto a page
if [ ! -e "$dir/output.pdf" ] && grep -qE "Not reading|File .?/etc/passwd.? not found" "$dir/build.log" "$dir/output.log" 2>/dev/null; then
  echo "ok   TeX may not read /etc/passwd"
else
  echo "FAIL TeX read /etc/passwd: openin_any is not in effect"
  grep -E "openin_any|passwd|Output written" "$dir/build.log" "$dir/output.log" | head -n 10
  status=1
fi

exit $status
