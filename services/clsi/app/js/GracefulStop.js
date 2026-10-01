// Stopping a compile without losing the pages that are already typeset.
//
// Killing TeX leaves a PDF without its cross-reference table, which no viewer
// can open, and may leave half-written .aux/.bbl files behind. Instead:
//
// 1. The compile command queues the answer "X" (quit) on latexmk's stdin, which
//    the TeX engines inherit (LatexRunner).
// 2. To stop, latexmk is frozen (SIGSTOP), so that it cannot start another
//    pass, and the TeX engines get SIGINT. TeX stops at its error prompt, reads
//    "X" and finishes the PDF with every page shipped out so far. Without the
//    "X", pdfTeX and LuaTeX hit end of file, treat it as a fatal error and
//    delete the PDF.
// 3. XeTeX and latex write .xdv/.dvi files, which latexmk would have converted
//    after the last pass; the script converts them itself.
//
// The script prints nothing and reports through its exit status:
//   0  every TeX engine and helper (biber, makeindex, ...) finished, so the
//      files in the compile directory are complete and can be kept for the
//      next compile
//   3  something was still running when the time ran out
//
// It runs inside the compile container, where every process belongs to the
// compile and PID 1 is the command's shell, or, for the local command runner,
// on the host with STOP_PGID set to the compile's process group.

import Settings from '@overleaf/settings'

// Process names of TeX engines (the command name in /proc/<pid>/stat).
const ENGINES = [
  'pdflatex',
  'pdftex',
  'xelatex',
  'xetex',
  'lualatex',
  'luatex',
  'luahbtex',
  'luajittex',
  'latex',
  'etex',
  'tex',
  'uplatex',
  'euptex',
  'platex',
  'eptex',
  'dvilualatex',
  'pdflatex-dev',
  'xelatex-dev',
  'lualatex-dev',
]

const STOP_SCRIPT = `
pgid=\${STOP_PGID:-}
leader=\${pgid:-1}
rounds=\${STOP_ROUNDS:-40}
cd "\${STOP_DIR:-.}" || exit 3

is_engine() {
  case "$1" in
    ${ENGINES.join('|')}) return 0 ;;
  esac
  return 1
}

# Sets "procs" to " pid:ppid:state:name" for every process of the compile,
# except PID 1 or the group leader (the command's shell), this script and
# its children.
scan() {
  procs=''
  for dir in /proc/[0-9]*; do
    pid=\${dir#/proc/}
    [ "$pid" = "$$" ] && continue
    [ "$pid" = "$leader" ] && continue
    { read -r stat < "$dir/stat"; } 2>/dev/null || continue
    name=\${stat#*\\(}
    name=\${name%\\)*}
    rest=\${stat##*\\) }
    state=\${rest%% *}
    rest=\${rest#* }
    ppid=\${rest%% *}
    rest=\${rest#* }
    group=\${rest%% *}
    [ -n "$pgid" ] && [ "$group" != "$pgid" ] && continue
    [ "$ppid" = "$$" ] && continue
    procs="$procs $pid:$ppid:$state:$name"
  done
}

split() {
  pid=\${1%%:*}
  rest=\${1#*:}
  ppid=\${rest%%:*}
  rest=\${rest#*:}
  state=\${rest%%:*}
  name=\${rest#*:}
}

# Whether an ancestor of process $1 is a running TeX engine (shell escape:
# the engine runs "sh -c ..." which runs the nested engine).
nested() {
  child=$1
  while :; do
    parent=''
    for q in $procs; do
      case "$q" in
        "$child":*)
          parent=\${q#*:}
          parent=\${parent%%:*}
          break
          ;;
      esac
    done
    [ -z "$parent" ] && return 1
    case "$engines" in
      *" $parent "*) return 0 ;;
    esac
    child=$parent
  done
}

# latexmk waits for the engine; frozen, it cannot start the next pass. It is
# the command shell's child, or further down when a prefix such as
# /usr/bin/time runs it.
scan
for p in $procs; do
  split "$p"
  is_engine "$name" && continue
  if [ "$ppid" = "$leader" ]; then
    kill -STOP "$pid" 2>/dev/null
    continue
  fi
  case "$(tr '\\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)" in
    *latexmk*) kill -STOP "$pid" 2>/dev/null ;;
  esac
done

interrupted=0
while :; do
  scan
  engines=' '
  for p in $procs; do
    split "$p"
    [ "$state" = Z ] && continue
    is_engine "$name" && engines="$engines$pid "
  done
  busy=0
  for p in $procs; do
    split "$p"
    case "$state" in
      Z | T | t) continue ;;
    esac
    busy=1
    # An engine started by another engine (e.g. a TikZ figure) is left to
    # finish; its parent ignores SIGINT until then.
    if is_engine "$name" && ! nested "$pid"; then
      kill -INT "$pid" 2>/dev/null && interrupted=1
    fi
  done
  [ "$busy" = 0 ] && break
  rounds=$((rounds - 1))
  [ "$rounds" -le 0 ] && exit 3
  sleep 0.25
done

if [ "$interrupted" = 1 ]; then
  for ext in xdv dvi; do
    if [ -f "output.$ext" ] && { [ ! -f output.pdf ] || [ "output.$ext" -nt output.pdf ]; }; then
      if [ "$ext" = xdv ]; then
        xdvipdfmx -q -E -o output.pdf output.xdv >/dev/null 2>&1 || exit 3
      else
        dvipdfmx -q -o output.pdf output.dvi >/dev/null 2>&1 || exit 3
      fi
    fi
  done
fi
exit 0
`

const STOPPED_CLEANLY = 0

const ROUND_MS = 250

// How long the engines get to finish their files before the compile is killed.
function gracePeriodMs() {
  return Settings.clsi?.gracefulStopTimeout ?? 10_000
}

function stopRounds(graceMs) {
  return Math.max(1, Math.floor(graceMs / ROUND_MS))
}

export default {
  ENGINES,
  STOP_SCRIPT,
  STOPPED_CLEANLY,
  gracePeriodMs,
  stopRounds,
}
