#!/bin/bash
# Run inside the compile image (the Pi base image; CI does, before anything is
# published): compiles every IIT Mandi template the way the compile service
# does, as the user compiles run as. That the sandbox keeps compiles away from
# the app's files is tested by smoke-test.py, through the running app.
#
#   check-tex.sh LIST
#
# LIST has one "id compiler main-file" line per template, with each template in
# /var/lib/overleaf/data/compiles/<id> (see the workflow).
set -uo pipefail

LIST=${1:?usage: check-tex.sh LIST}
ROOT=/var/lib/overleaf/data/compiles
status=0

biber --version 2>&1 | head -n 1

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

# Microsoft's font names get the free fonts with the same metrics (texmf/fontspec.cfg)
dir="$ROOT/microsoft-font-names"
mkdir -p "$dir"
printf '%s\n' '\documentclass{article}' '\usepackage{fontspec}' '\setmainfont{Calibri}' \
  '\newfontfamily\headingfont{Times New Roman}' '\begin{document}' \
  'Body \textbf{bold} \textit{italic} {\headingfont Heading \textbf{bold}}' '\end{document}' > "$dir/main.tex"
chown -R www-data:www-data "$dir"
compile "$dir" xelatex main.tex
fonts=$(pdffonts "$dir/output.pdf" 2> /dev/null)
if [ -s "$dir/output.pdf" ] && ! grep -q "^! " "$dir/output.log" &&
  echo "$fonts" | grep -q "Carlito-Bold" && echo "$fonts" | grep -q "LiberationSerif"; then
  echo "ok   Calibri and Times New Roman load Carlito and Liberation Serif"
else
  echo "FAIL Calibri and Times New Roman do not load their free equivalents"
  grep -A3 -E "^! " "$dir/output.log" | head -n 20
  echo "$fonts"
  status=1
fi

exit $status
