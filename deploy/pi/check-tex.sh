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
  # The compile service's command (services/clsi/app/js/LatexRunner.js), with
  # the extra flag pi.env gives it (TEX_COMPILER_EXTRA_FLAGS)
  (cd "$1" && /sbin/setuser www-data latexmk -cd -jobname=output -auxdir="$1" -outdir="$1" \
    -synctex=1 -interaction=batchmode -f -shell-escape "$flag" "$1/$3" > build.log 2>&1 < /dev/null)
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
  # XeLaTeX takes TeX Live's own copy of Carlito, named without "-Regular"
  for font in "Carlito(-Regular)?" Carlito-Bold Carlito-Italic Carlito-BoldItalic LiberationSerif \
    LiberationSerif-Bold LiberationSerif-Italic Caladea-Regular LiberationSans LiberationMono; do
    echo "$fonts" | grep -qE "\+$font " || missing="$missing $font"
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

# Compiles a document and checks that it has no errors, that its PDF uses the
# given fonts (PostScript names, or their start) and has the given text
check_doc() { # name engine "fonts" text description, then the document's lines
  local name=$1 engine=$2 want=$3 text=$4 what=$5 dir="$ROOT/$1-$2" fonts font missing=""
  shift 5
  mkdir -p "$dir"
  printf '%s\n' "$@" > "$dir/main.tex"
  [ "$name" = eps ] && printf '%s\n' '%!PS-Adobe-3.0 EPSF-3.0' '%%BoundingBox: 0 0 100 20' \
    '/Helvetica findfont 12 scalefont setfont 2 5 moveto (FIGURE) show' 'showpage' > "$dir/figure.eps"
  chown -R www-data:www-data "$dir"
  compile "$dir" "$engine" main.tex
  fonts=$(pdffonts "$dir/output.pdf" 2> /dev/null)
  for font in $want; do
    echo "$fonts" | grep -q "+$font" || missing="$missing $font"
  done
  [ -z "$text" ] || pdftotext "$dir/output.pdf" - 2> /dev/null | grep -q "$text" || missing="$missing text:$text"
  if [ -s "$dir/output.pdf" ] && ! grep -q "^! " "$dir/output.log" && [ -z "$missing" ]; then
    echo "ok   $engine: $what"
  else
    echo "FAIL $engine: $what (missing:${missing:- none})"
    grep -A3 -E "^! " "$dir/output.log" | head -n 20
    tail -n 5 "$dir/build.log"
    echo "$fonts"
    status=1
  fi
}

for engine in xelatex lualatex; do
  check_doc more-font-names "$engine" \
    "LiberationSans-Bold Gelasio-Regular Gelasio-Bold TeXGyrePagella-Regular TeXGyrePagella-Bold
     TeXGyreSchola-Regular TeXGyreBonum-Regular TeXGyreAdventor-Regular EBGaramond" "" \
    "Helvetica, Georgia, Palatino Linotype, Book Antiqua, Century Schoolbook, Bookman Old Style, Century Gothic and Garamond load free fonts" \
    '\documentclass{article}' '\usepackage{fontspec}' '\setmainfont{Helvetica}' \
    '\newfontfamily\georgia{Georgia}' '\newfontfamily\palatino{Palatino Linotype}' \
    '\newfontfamily\antiqua{Book Antiqua}' '\newfontfamily\schoolbook{Century Schoolbook}' \
    '\newfontfamily\bookman{Bookman Old Style}' '\newfontfamily\gothic{Century Gothic}' \
    '\newfontfamily\garamond{Garamond}' '\begin{document}' '\textbf{Helvetica}' \
    '{\georgia Georgia \textbf{bold}} {\palatino Palatino \textbf{bold}} {\antiqua Antiqua}' \
    '{\schoolbook Schoolbook} {\bookman Bookman} {\gothic Gothic} {\garamond Garamond}' '\end{document}'
  # TeX Live has hundreds of OpenType fonts; XeLaTeX finds them through
  # fontconfig (09-texlive.conf), LuaLaTeX through its index
  check_doc tex-live-fonts "$engine" "TeXGyreTermes-Regular LibertinusSerif-Regular" "" \
    "TeX Live's own fonts load by name" \
    '\documentclass{article}' '\usepackage{fontspec}' '\setmainfont{TeX Gyre Termes}' \
    '\newfontfamily\libertinus{Libertinus Serif}' '\begin{document}' \
    'Termes {\libertinus Libertinus}' '\end{document}'
done

# Each compile starts afresh from the image, so LuaLaTeX needs the font index
# built into it; without one it builds its own on every compile
if ls "$(kpsewhich -var-value TEXMFSYSVAR)"/luatex-cache/generic/names/luaotfload-names.* > /dev/null 2>&1; then
  echo "ok   lualatex: the image has its font index"
else
  echo "FAIL lualatex: no font index in the image, so every compile builds one"
  status=1
fi

# Hindi, with Word's Devanagari fonts (Noto)
check_doc hindi xelatex "NotoSansDevanagari-Regular NotoSansDevanagari-Bold NotoSerifDevanagari-Regular" "" \
  "Hindi with Mangal and Kokila loads Noto Devanagari" \
  '\documentclass{article}' '\usepackage{polyglossia}' '\setdefaultlanguage{english}' \
  '\setotherlanguage{hindi}' '\newfontfamily\devanagarifont[Script=Devanagari]{Mangal}' \
  '\newfontfamily\kokila[Script=Devanagari]{Kokila}' '\begin{document}' \
  '\texthindi{नमस्ते \textbf{दुनिया}} {\kokila नमस्ते}' '\end{document}'

# .eps figures, which Ghostscript turns into PDF
for engine in pdflatex xelatex; do
  check_doc eps "$engine" "" FIGURE "an .eps figure is included" \
    '\documentclass{article}' '\usepackage{graphicx}' '\begin{document}' \
    '\includegraphics{figure.eps}' '\end{document}'
done

# Code listings with minted, which needs Pygments (TeX Live brings its own)
check_doc minted pdflatex "" hello "minted highlights code" \
  '\documentclass{article}' '\usepackage{minted}' '\begin{document}' \
  '\begin{minted}{python}' 'print("hello")' '\end{minted}' '\end{document}'

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
