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

# Microsoft's font names get the free fonts with the same metrics, and TeX
# Live's own fontspec settings still hold, so -- is an en dash (texmf/fontspec.cfg)
for engine in xelatex lualatex; do
  dir="$ROOT/microsoft-font-names-$engine"
  mkdir -p "$dir"
  printf '%s\n' '\documentclass{article}' '\usepackage{fontspec}' '\setmainfont{Calibri}' \
    '\newfontfamily\headingfont{Times New Roman}' '\newfontfamily\cambria{Cambria}' \
    '\setsansfont{Arial}' '\setmonofont{Courier New}' '\begin{document}' \
    'Body \textbf{bold} \textit{italic} \textbf{\textit{both}} pages 1--2' \
    '{\headingfont Heading \textbf{bold} \textit{italic}} {\cambria Cambria}' \
    '\textsf{Sans} \texttt{Mono}' '\end{document}' > "$dir/main.tex"
  chown -R www-data:www-data "$dir"
  compile "$dir" "$engine" main.tex
  fonts=$(pdffonts "$dir/output.pdf" 2> /dev/null)
  missing=""
  for font in Carlito-Regular Carlito-Bold Carlito-Italic Carlito-BoldItalic LiberationSerif \
    LiberationSerif-Bold LiberationSerif-Italic Caladea-Regular LiberationSans LiberationMono; do
    echo "$fonts" | grep -q "+$font " || missing="$missing $font"
  done
  if [ -s "$dir/output.pdf" ] && ! grep -q "^! " "$dir/output.log" && [ -z "$missing" ] &&
    pdftotext "$dir/output.pdf" - | grep -q "1–2"; then
    echo "ok   $engine: Microsoft's font names load their free equivalents, -- is an en dash"
  else
    echo "FAIL $engine: Microsoft's font names or TeX ligatures (missing:${missing:- none})"
    grep -A3 -E "^! " "$dir/output.log" | head -n 20
    echo "$fonts"
    status=1
  fi
done

# After a failed compile, the next one runs again although no file changed:
# the compile service deletes the log and the PDF before each compile, so a
# latexmk that skips the run leaves the editor with neither (server-ce/config/latexmkrc)
dir="$ROOT/compile-again"
mkdir -p "$dir"
printf '%s\n' '\documentclass{article}' '\begin{document}' '\undefinedcommand' '\end{document}' > "$dir/main.tex"
chown -R www-data:www-data "$dir"
compile "$dir" pdflatex main.tex
rm -f "$dir/output.log" "$dir/output.pdf"
compile "$dir" pdflatex main.tex
if [ -s "$dir/output.log" ]; then
  echo "ok   a compile after a failed one runs again and writes its log"
else
  echo "FAIL a compile after a failed one did not run again"
  tail -n 20 "$dir/build.log"
  status=1
fi

exit $status
