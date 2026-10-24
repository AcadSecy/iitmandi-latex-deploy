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
if grep -q "root:" "$dir/output.log" "$dir/output.pdf" 2>/dev/null || ! grep -q "openin_any = p" "$dir/build.log" "$dir/output.log" 2>/dev/null; then
  echo "FAIL TeX read /etc/passwd, or was not stopped by openin_any"
  tail -n 20 "$dir/output.log"
  status=1
else
  echo "ok   TeX may not read /etc/passwd"
fi

exit $status
