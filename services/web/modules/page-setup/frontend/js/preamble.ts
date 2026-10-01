// Reads and changes the page setup of a LaTeX document (font size, paper
// size, margins, line spacing and font) in its preamble, so that people who
// don't know LaTeX can change them from a dialog. Only the text before
// \begin{document} is read or changed, and only the commands below are
// touched; everything else in the preamble is left as it is.
//
// The edits are chosen to be safe whatever the document class loads:
// - margins go in \geometry{...} after a bare \usepackage{geometry}, because
//   giving options to a geometry the class already loaded is an option clash
//   (our thesis class loads it);
// - line spacing uses setspace, loaded without options for the same reason;
// - font size and paper size are class options, which geometry also reads.

export type Spacing = 'single' | 'onehalf' | 'double'
export type FontFamily = 'times' | 'helvetica'

export type PageSetup = {
  /** A class option such as '12pt'; null when the class default is used */
  fontSize: string | null
  /** A paper option such as 'a4paper'; null when the class default is used */
  paper: string | null
  /** One margin for all sides, such as '2.5cm'; 'custom' when the sides differ */
  margin: string | null
  spacing: Spacing | 'custom' | null
  font: FontFamily | 'custom' | null
}

export type PreambleInfo = {
  documentClass: string
  setup: PageSetup
  /** False when the document sets its fonts in a way the dialog can't change */
  fontEditable: boolean
}

const SPACING_COMMANDS: Record<Spacing, string> = {
  single: 'singlespacing',
  onehalf: 'onehalfspacing',
  double: 'doublespacing',
}

const SPACING_BY_COMMAND: Record<string, Spacing> = {
  singlespacing: 'single',
  onehalfspacing: 'onehalf',
  doublespacing: 'double',
}

// geometry options that set the margins or the size of the text area
const MARGIN_KEYS = new Set([
  'margin',
  'left',
  'right',
  'top',
  'bottom',
  'lmargin',
  'rmargin',
  'tmargin',
  'bmargin',
  'hmargin',
  'vmargin',
  'inner',
  'outer',
  'hmarginratio',
  'vmarginratio',
  'marginratio',
  'textwidth',
  'textheight',
  'width',
  'height',
  'body',
  'text',
  'total',
  'hscale',
  'vscale',
  'scale',
  'hdivide',
  'vdivide',
  'divide',
  'lines',
])

const PAPER_OPTION =
  /^(?:[abc][0-6]|b[0-6]j|ansi[a-e]|letter|legal|executive)paper$/
const PAPER_KEYS = new Set(['paper', 'papername', 'papersize'])
const FONT_SIZE_OPTION = /^\d+(?:\.\d+)?pt$/

const TIMES_PACKAGES = new Set([
  'mathptmx',
  'times',
  'newtxtext',
  'newtxmath',
  'tgtermes',
  'txfonts',
])
const HELVETICA_PACKAGES = new Set(['helvet', 'tgheros', 'uarial'])
// Fonts set up in ways the dialog can't safely undo
const OTHER_FONT_PACKAGES = new Set([
  'fontspec',
  'unicode-math',
  'mathspec',
  'palatino',
  'mathpazo',
  'newpxtext',
  'newpxmath',
  'pxfonts',
  'libertine',
  'libertinus',
  'kpfonts',
  'charter',
  'XCharter',
  'ebgaramond',
  'garamondx',
  'fourier',
  'cmbright',
  'sourceserifpro',
  'sourcesanspro',
  'lato',
  'roboto',
  'opensans',
  'bookman',
  'avant',
  'newcent',
  'utopia',
  'mlmodern',
  'fbb',
  'stix',
  'stix2',
  'baskervillef',
  'cochineal',
  'crimson',
  'tgpagella',
  'tgbonum',
  'tgschola',
  'tgadventor',
  'tgcursor',
])

const TIMES_LINES = ['\\usepackage{mathptmx}']
const HELVETICA_LINES = [
  '\\usepackage[scaled=0.92]{helvet}',
  '\\renewcommand{\\familydefault}{\\sfdefault}',
]

type Arg = {
  /** Start and end of the text inside the brackets or braces */
  start: number
  end: number
  text: string
  /** Whether the argument is wrapped in brackets or braces */
  delimited: boolean
}

type Macro = {
  name: string
  start: number
  end: number
  opt: Arg | null
  args: Arg[]
}

// How many mandatory arguments to read for each command the parser looks at
const ARG_COUNTS: Record<string, number> = {
  documentclass: 1,
  usepackage: 1,
  RequirePackage: 1,
  geometry: 1,
  newgeometry: 1,
  setstretch: 1,
  linespread: 1,
  renewcommand: 2,
  setmainfont: 1,
  singlespacing: 0,
  onehalfspacing: 0,
  doublespacing: 0,
}

/**
 * The text with comments blanked out, keeping every offset the same, so that
 * commands can be found in the result and edited in the original.
 */
export function maskComments(text: string) {
  let result = ''
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\' && i + 1 < text.length) {
      result += text.slice(i, i + 2)
      i += 2
    } else if (ch === '%') {
      const lineEnd = text.indexOf('\n', i)
      const end = lineEnd === -1 ? text.length : lineEnd
      result += ' '.repeat(end - i)
      i = end
    } else {
      result += ch
      i++
    }
  }
  return result
}

function skipSpace(masked: string, pos: number) {
  while (pos < masked.length && /\s/.test(masked[pos])) pos++
  return pos
}

// The end of a group that starts with `open` at `pos`, or -1
function matchGroup(masked: string, pos: number, open: string, close: string) {
  let depth = 0
  let braces = 0
  for (let i = pos; i < masked.length; i++) {
    const ch = masked[i]
    if (ch === '\\') {
      i++
    } else if (open === '[' && ch === '{') {
      braces++
    } else if (open === '[' && ch === '}') {
      braces--
    } else if (ch === open && braces === 0) {
      depth++
    } else if (ch === close && braces === 0) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function readGroup(
  masked: string,
  pos: number,
  open: string,
  close: string
): Arg | null {
  const end = matchGroup(masked, pos, open, close)
  if (end === -1) return null
  return {
    start: pos + 1,
    end,
    text: masked.slice(pos + 1, end),
    delimited: true,
  }
}

function parseMacro(masked: string, name: string, start: number): Macro | null {
  let pos = start + 1 + name.length
  let opt: Arg | null = null
  const args: Arg[] = []
  const count = ARG_COUNTS[name]
  if (count > 0) {
    let next = skipSpace(masked, pos)
    if (masked[next] === '[') {
      opt = readGroup(masked, next, '[', ']')
      if (!opt) return null
      pos = opt.end + 1
      next = skipSpace(masked, pos)
    }
    for (let n = 0; n < count; n++) {
      next = skipSpace(masked, pos)
      if (masked[next] === '{') {
        const arg = readGroup(masked, next, '{', '}')
        if (!arg) return null
        args.push(arg)
        pos = arg.end + 1
      } else {
        // a single token, as in \renewcommand\baselinestretch{1.5}
        const token = /^\\[a-zA-Z@]+|^\S/.exec(masked.slice(next))
        if (!token) return null
        args.push({
          start: next,
          end: next + token[0].length,
          text: token[0],
          delimited: false,
        })
        pos = next + token[0].length
      }
    }
  }
  return { name, start, end: pos, opt, args }
}

type Parsed = {
  text: string
  masked: string
  /** Where \begin{document} starts */
  preambleEnd: number
  macros: Macro[]
}

function parse(text: string): Parsed | null {
  const masked = maskComments(text)
  const begin = /\\begin\s*\{document\}/.exec(masked)
  if (!begin) return null
  const preambleEnd = begin.index
  const macros: Macro[] = []
  const re = /\\([a-zA-Z@]+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(masked)) && match.index < preambleEnd) {
    const name = match[1]
    if (!(name in ARG_COUNTS)) continue
    const macro = parseMacro(masked, name, match.index)
    if (macro && macro.end <= preambleEnd) {
      macros.push(macro)
      re.lastIndex = macro.end
    }
  }
  return { text, masked, preambleEnd, macros }
}

/** Split an option or package list at top-level commas */
export function splitList(list: string) {
  const items: string[] = []
  let depth = 0
  let current = ''
  for (let i = 0; i < list.length; i++) {
    const ch = list[i]
    if (ch === '\\') {
      current += list.slice(i, i + 2)
      i++
      continue
    }
    if (ch === '{') depth++
    if (ch === '}') depth--
    if (ch === ',' && depth === 0) {
      items.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  items.push(current)
  return items.map(item => item.trim()).filter(item => item !== '')
}

function joinList(items: string[], original: string) {
  return items.join(/,\s/.test(original) ? ', ' : ',')
}

function optionKey(option: string) {
  const eq = option.indexOf('=')
  return (eq === -1 ? option : option.slice(0, eq)).trim()
}

function optionValue(option: string) {
  const eq = option.indexOf('=')
  if (eq === -1) return null
  return option
    .slice(eq + 1)
    .trim()
    .replace(/^\{(.*)\}$/, '$1')
    .replace(/\s+/g, '')
}

function isPackageLoad(macro: Macro) {
  return macro.name === 'usepackage' || macro.name === 'RequirePackage'
}

function packagesOf(macro: Macro) {
  return isPackageLoad(macro) && macro.args[0]
    ? splitList(macro.args[0].text)
    : []
}

function loads(macro: Macro, pkg: string) {
  return packagesOf(macro).includes(pkg)
}

function documentClassMacro(parsed: Parsed) {
  return parsed.macros.find(macro => macro.name === 'documentclass')
}

function isRenewOf(macro: Macro, command: string) {
  return macro.name === 'renewcommand' && macro.args[0]?.text.trim() === command
}

// The option lists that geometry reads: options of a \usepackage that loads
// geometry alone, and the arguments of \geometry
function geometryLists(parsed: Parsed) {
  const lists: { macro: Macro; arg: Arg }[] = []
  for (const macro of parsed.macros) {
    if (
      isPackageLoad(macro) &&
      macro.opt &&
      packagesOf(macro).length === 1 &&
      loads(macro, 'geometry')
    ) {
      lists.push({ macro, arg: macro.opt })
    } else if (macro.name === 'geometry' && macro.args[0]) {
      lists.push({ macro, arg: macro.args[0] })
    }
  }
  return lists
}

function readMargin(parsed: Parsed): string | null {
  const values: Record<string, string> = {}
  let found = false
  for (const { arg } of geometryLists(parsed)) {
    for (const option of splitList(arg.text)) {
      const key = optionKey(option)
      if (MARGIN_KEYS.has(key)) {
        found = true
        const value = optionValue(option)
        if (key === 'margin' && value && !value.includes(',')) {
          for (const side of ['left', 'right', 'top', 'bottom']) {
            values[side] = value
          }
        } else if (['left', 'right', 'top', 'bottom'].includes(key) && value) {
          values[key] = value
        } else {
          values[key] = option
        }
      }
    }
  }
  if (!found) return null
  const sides = ['left', 'right', 'top', 'bottom'].map(side => values[side])
  const others = Object.keys(values).filter(
    key => !['left', 'right', 'top', 'bottom'].includes(key)
  )
  if (others.length === 0 && sides.every(side => side && side === sides[0])) {
    return sides[0]
  }
  return 'custom'
}

function readPaper(parsed: Parsed, classOptions: string[]): string | null {
  let paper: string | null = null
  for (const option of classOptions) {
    if (PAPER_OPTION.test(option)) paper = option
  }
  for (const { arg } of geometryLists(parsed)) {
    for (const option of splitList(arg.text)) {
      const key = optionKey(option)
      if (PAPER_OPTION.test(key)) paper = key
      if (PAPER_KEYS.has(key)) {
        const value = optionValue(option)
        if (value) paper = value.endsWith('paper') ? value : `${value}paper`
      }
    }
  }
  return paper
}

function stretchSpacing(value: string): Spacing | 'custom' {
  return Number(value.trim()) === 1 ? 'single' : 'custom'
}

function readSpacing(parsed: Parsed): Spacing | 'custom' | null {
  let spacing: Spacing | 'custom' | null = null
  for (const macro of parsed.macros) {
    if (macro.name in SPACING_BY_COMMAND) {
      spacing = SPACING_BY_COMMAND[macro.name]
    } else if (loads(macro, 'setspace') && macro.opt) {
      for (const option of splitList(macro.opt.text)) {
        if (option in SPACING_BY_COMMAND) spacing = SPACING_BY_COMMAND[option]
      }
    } else if (
      (macro.name === 'setstretch' || macro.name === 'linespread') &&
      macro.args[0]
    ) {
      spacing = stretchSpacing(macro.args[0].text)
    } else if (isRenewOf(macro, '\\baselinestretch') && macro.args[1]) {
      spacing = stretchSpacing(macro.args[1].text)
    }
  }
  return spacing
}

function readFont(parsed: Parsed): {
  font: FontFamily | 'custom' | null
  editable: boolean
} {
  const packages = parsed.macros.flatMap(packagesOf)
  if (
    packages.some(pkg => OTHER_FONT_PACKAGES.has(pkg)) ||
    parsed.macros.some(macro => macro.name === 'setmainfont')
  ) {
    return { font: 'custom', editable: false }
  }
  const sans = parsed.macros.some(
    macro =>
      isRenewOf(macro, '\\familydefault') &&
      macro.args[1]?.text.trim() === '\\sfdefault'
  )
  if (sans) {
    return {
      font: packages.some(pkg => HELVETICA_PACKAGES.has(pkg))
        ? 'helvetica'
        : 'custom',
      editable: true,
    }
  }
  if (packages.some(pkg => TIMES_PACKAGES.has(pkg))) {
    return { font: 'times', editable: true }
  }
  return { font: null, editable: true }
}

// Classes that lay out their own pages, which the dialog leaves alone
const OWN_LAYOUT_CLASSES = new Set([
  'beamer',
  'tikzposter',
  'a0poster',
  'sciposter',
  'baposter',
])

/** Whether the page setup dialog can change documents of this class */
export function hasPageSetup(documentClass: string) {
  return !OWN_LAYOUT_CLASSES.has(documentClass)
}

/**
 * The page setup of a document, or null when the text is not a main file
 * (no \documentclass before \begin{document}).
 */
export function readPageSetup(text: string): PreambleInfo | null {
  const parsed = parse(text)
  if (!parsed) return null
  const docClass = documentClassMacro(parsed)
  if (!docClass?.args[0]) return null
  const classOptions = docClass.opt ? splitList(docClass.opt.text) : []
  const { font, editable } = readFont(parsed)
  return {
    documentClass: docClass.args[0].text.trim(),
    setup: {
      fontSize:
        classOptions.filter(option => FONT_SIZE_OPTION.test(option)).pop() ??
        null,
      paper: readPaper(parsed, classOptions),
      margin: readMargin(parsed),
      spacing: readSpacing(parsed),
      font,
    },
    fontEditable: editable,
  }
}

function splice(text: string, from: number, to: number, insert = '') {
  return text.slice(0, from) + insert + text.slice(to)
}

// Remove a command, and its whole line when nothing else is on it
function removeMacro(parsed: Parsed, macro: Macro) {
  const { text, masked } = parsed
  const lineStart = text.lastIndexOf('\n', macro.start - 1) + 1
  const newline = text.indexOf('\n', macro.end)
  const lineEnd = newline === -1 ? text.length : newline
  if (
    masked.slice(lineStart, macro.start).trim() === '' &&
    masked.slice(macro.end, lineEnd).trim() === ''
  ) {
    return splice(text, lineStart, newline === -1 ? lineEnd : lineEnd + 1)
  }
  return splice(text, macro.start, macro.end)
}

// Replace the items of a bracketed or braced list; an empty option list loses
// its brackets
function replaceList(parsed: Parsed, arg: Arg, items: string[]) {
  const joined = joinList(items, parsed.text.slice(arg.start, arg.end))
  if (items.length === 0 && parsed.text[arg.start - 1] === '[') {
    return splice(parsed.text, arg.start - 1, arg.end + 1)
  }
  return splice(parsed.text, arg.start, arg.end, joined)
}

// Apply `edit` to the first matching item, re-parsing after each change, until
// nothing matches. Edits that remove text keep earlier offsets valid, but
// re-parsing is simpler and preambles are short.
function repeatEdit(
  text: string,
  edit: (parsed: Parsed) => string | null
): string {
  for (let i = 0; i < 1000; i++) {
    const parsed = parse(text)
    if (!parsed) return text
    const next = edit(parsed)
    if (next === null) return text
    text = next
  }
  return text
}

// Commands that new page setup lines go after, so that a \geometry or a
// spacing command stays next to the package it belongs to
function isSetupMacro(macro: Macro) {
  return (
    isPackageLoad(macro) ||
    macro.name === 'geometry' ||
    macro.name === 'setstretch' ||
    macro.name === 'linespread' ||
    macro.name in SPACING_BY_COMMAND ||
    isRenewOf(macro, '\\familydefault') ||
    isRenewOf(macro, '\\baselinestretch')
  )
}

// Where new lines go: after the last package or page setup command in the
// preamble, or after \documentclass when there is none
function insertLines(text: string, lines: string[], after?: Macro) {
  const parsed = parse(text)
  if (!parsed) return text
  const anchor =
    after ??
    parsed.macros.filter(isSetupMacro).pop() ??
    documentClassMacro(parsed)
  if (!anchor) return text
  const newline = text.indexOf('\n', anchor.end)
  const block = lines.join('\n') + '\n'
  if (newline === -1) return `${text}\n${block}`
  return splice(text, newline + 1, newline + 1, block)
}

function editClassOptions(
  text: string,
  change: (options: string[]) => string[]
) {
  const parsed = parse(text)
  const docClass = parsed && documentClassMacro(parsed)
  if (!parsed || !docClass) return text
  const options = docClass.opt ? splitList(docClass.opt.text) : []
  const next = change(options)
  if (next.join(',') === options.join(',')) return text
  if (docClass.opt) return replaceList(parsed, docClass.opt, next)
  const at = docClass.start + '\\documentclass'.length
  return splice(text, at, at, `[${next.join(',')}]`)
}

// Remove options matching `drop` from every geometry option list. A \geometry
// left empty is removed.
function dropGeometryOptions(text: string, drop: (option: string) => boolean) {
  return repeatEdit(text, parsed => {
    for (const { macro, arg } of geometryLists(parsed)) {
      const options = splitList(arg.text)
      const kept = options.filter(option => !drop(option))
      if (kept.length === options.length) continue
      if (kept.length === 0 && macro.name === 'geometry') {
        return removeMacro(parsed, macro)
      }
      return replaceList(parsed, arg, kept)
    }
    return null
  })
}

export function setFontSize(text: string, size: string | null) {
  return editClassOptions(text, options => [
    ...options.filter(option => !FONT_SIZE_OPTION.test(option)),
    ...(size ? [size] : []),
  ])
}

export function setPaper(text: string, paper: string | null) {
  text = dropGeometryOptions(text, option => {
    const key = optionKey(option)
    return PAPER_OPTION.test(key) || PAPER_KEYS.has(key)
  })
  return editClassOptions(text, options => [
    ...options.filter(option => !PAPER_OPTION.test(option)),
    ...(paper ? [paper] : []),
  ])
}

// The geometry option list that gets the margin: the options of the
// \usepackage that loads geometry, or else the first \geometry
function marginTarget(parsed: Parsed) {
  const lists = geometryLists(parsed)
  return (
    lists.find(({ macro }) => isPackageLoad(macro)) ??
    lists.find(({ macro }) => macro.name === 'geometry')
  )
}

export function setMargin(text: string, margin: string | null) {
  // margins set anywhere other than where the new one goes are removed
  text = repeatEdit(text, parsed => {
    const target = margin ? marginTarget(parsed) : undefined
    for (const { macro, arg } of geometryLists(parsed)) {
      if (macro.start === target?.macro.start) continue
      const options = splitList(arg.text)
      const kept = options.filter(option => !MARGIN_KEYS.has(optionKey(option)))
      if (kept.length === options.length) continue
      if (kept.length === 0 && macro.name === 'geometry') {
        return removeMacro(parsed, macro)
      }
      return replaceList(parsed, arg, kept)
    }
    return null
  })
  const parsed = parse(text)
  if (!parsed) return text
  const geometryLoads = parsed.macros.filter(macro => loads(macro, 'geometry'))
  const usesGeometry = parsed.macros.some(
    macro => macro.name === 'geometry' || macro.name === 'newgeometry'
  )

  if (!margin) {
    // A bare \usepackage{geometry} changes the layout by itself, so remove one
    // that is left with nothing to do
    const bare = geometryLoads.find(
      macro => packagesOf(macro).length === 1 && !macro.opt
    )
    if (bare && !usesGeometry && geometryLoads.length === 1) {
      return removeMacro(parsed, bare)
    }
    return text
  }

  const setting = `margin=${margin}`
  const target = marginTarget(parsed)
  if (target) {
    // the new margin takes the place of the first margin option
    const options: string[] = []
    let placed = false
    for (const option of splitList(target.arg.text)) {
      if (!MARGIN_KEYS.has(optionKey(option))) {
        options.push(option)
      } else if (!placed) {
        options.push(setting)
        placed = true
      }
    }
    if (!placed) options.push(setting)
    return replaceList(parsed, target.arg, options)
  }
  if (geometryLoads.length > 0) {
    return insertLines(text, [`\\geometry{${setting}}`], geometryLoads[0])
  }
  return insertLines(text, ['\\usepackage{geometry}', `\\geometry{${setting}}`])
}

export function setSpacing(text: string, spacing: Spacing | null) {
  text = repeatEdit(text, parsed => {
    for (const macro of parsed.macros) {
      if (
        macro.name in SPACING_BY_COMMAND ||
        macro.name === 'setstretch' ||
        macro.name === 'linespread' ||
        isRenewOf(macro, '\\baselinestretch')
      ) {
        return removeMacro(parsed, macro)
      }
      if (loads(macro, 'setspace') && macro.opt) {
        const options = splitList(macro.opt.text)
        const kept = options.filter(option => !(option in SPACING_BY_COMMAND))
        if (kept.length !== options.length) {
          return replaceList(parsed, macro.opt, kept)
        }
      }
    }
    return null
  })
  if (!spacing) return text
  const command = `\\${SPACING_COMMANDS[spacing]}`
  const parsed = parse(text)
  const setspace = parsed?.macros.find(macro => loads(macro, 'setspace'))
  if (setspace) return insertLines(text, [command], setspace)
  return insertLines(text, ['\\usepackage{setspace}', command])
}

export function setFont(text: string, font: FontFamily | null) {
  const managed = new Set([...TIMES_PACKAGES, ...HELVETICA_PACKAGES])
  text = repeatEdit(text, parsed => {
    for (const macro of parsed.macros) {
      if (
        isRenewOf(macro, '\\familydefault') &&
        macro.args[1]?.text.trim() === '\\sfdefault'
      ) {
        return removeMacro(parsed, macro)
      }
      const packages = packagesOf(macro)
      const kept = packages.filter(pkg => !managed.has(pkg))
      if (kept.length === packages.length) continue
      if (kept.length === 0) return removeMacro(parsed, macro)
      return replaceList(parsed, macro.args[0], kept)
    }
    return null
  })
  if (font === 'times') return insertLines(text, TIMES_LINES)
  if (font === 'helvetica') return insertLines(text, HELVETICA_LINES)
  return text
}

/**
 * The document with the page setup changed. Only the settings in `changes`
 * are touched; the rest of the document is kept as it is.
 */
export function applyPageSetup(text: string, changes: Partial<PageSetup>) {
  if (changes.fontSize !== undefined) {
    text = setFontSize(text, changes.fontSize)
  }
  if (changes.paper !== undefined) {
    text = setPaper(text, changes.paper)
  }
  if (changes.margin !== undefined && changes.margin !== 'custom') {
    text = setMargin(text, changes.margin)
  }
  if (changes.spacing !== undefined && changes.spacing !== 'custom') {
    text = setSpacing(text, changes.spacing)
  }
  if (changes.font !== undefined && changes.font !== 'custom') {
    text = setFont(text, changes.font)
  }
  return text
}

/**
 * The document with \usepackage{pkg} added after the last package, unless the
 * preamble already loads it or one of `alternatives`. Loading a package
 * without options never clashes with the class loading it too. Unchanged
 * when the text is not a main file.
 */
export function ensurePackage(
  text: string,
  pkg: string,
  alternatives: string[] = []
) {
  const parsed = parse(text)
  if (!parsed || !documentClassMacro(parsed)) return text
  const names = new Set([pkg, ...alternatives])
  if (parsed.macros.some(macro => packagesOf(macro).some(n => names.has(n)))) {
    return text
  }
  return insertLines(text, [`\\usepackage{${pkg}}`])
}

/** Where \begin{document} starts, or -1 when the text has none */
export function documentBodyStart(text: string) {
  return parse(text)?.preambleEnd ?? -1
}

export type TextChange = { from: number; to: number; insert: string }

/**
 * The changed lines between two versions of a text, as editor changes on the
 * old text. Keeping unchanged lines out of the changes keeps undo and track
 * changes tidy.
 */
export function lineChanges(before: string, after: string): TextChange[] {
  if (before === after) return []
  const a = before.split('\n')
  const b = after.split('\n')
  // trim the common start and end, then diff the middle by longest common
  // subsequence (preambles are short)
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++
  }
  const midA = a.slice(head, a.length - tail)
  const midB = b.slice(head, b.length - tail)
  const lcs: number[][] = Array.from({ length: midA.length + 1 }, () =>
    new Array(midB.length + 1).fill(0)
  )
  for (let i = midA.length - 1; i >= 0; i--) {
    for (let j = midB.length - 1; j >= 0; j--) {
      lcs[i][j] =
        midA[i] === midB[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  // offsets of the start of each line of the old text
  const lineStarts: number[] = []
  let offset = 0
  for (const line of a) {
    lineStarts.push(offset)
    offset += line.length + 1
  }
  const startOf = (line: number) =>
    line < a.length ? lineStarts[line] : before.length + 1

  const changes: TextChange[] = []
  let i = 0
  let j = 0
  while (i < midA.length || j < midB.length) {
    if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
      i++
      j++
      continue
    }
    const fromLine = head + i
    const inserted: string[] = []
    while (i < midA.length || j < midB.length) {
      if (i < midA.length && j < midB.length && midA[i] === midB[j]) break
      if (
        j < midB.length &&
        (i >= midA.length || lcs[i][j + 1] >= lcs[i + 1][j])
      ) {
        inserted.push(midB[j])
        j++
      } else {
        i++
      }
    }
    const toLine = head + i
    changes.push(lineRangeChange(before, startOf, fromLine, toLine, inserted))
  }
  return changes
}

// Replace whole lines [fromLine, toLine) of the old text with `lines`
function lineRangeChange(
  before: string,
  startOf: (line: number) => number,
  fromLine: number,
  toLine: number,
  lines: string[]
): TextChange {
  const from = startOf(fromLine)
  const to = startOf(toLine)
  if (to > before.length) {
    // the range runs to the end of the text, which has no final newline
    if (from > before.length) {
      return {
        from: before.length,
        to: before.length,
        insert: '\n' + lines.join('\n'),
      }
    }
    return {
      from: lines.length === 0 && from > 0 ? from - 1 : from,
      to: before.length,
      insert: lines.join('\n'),
    }
  }
  return {
    from,
    to,
    insert: lines.length > 0 ? lines.join('\n') + '\n' : '',
  }
}
