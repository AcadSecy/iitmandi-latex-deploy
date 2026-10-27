// \include{...} arguments only: \includeonly and \includegraphics have more
// letters before the brace, so they do not match.
const INCLUDE = /\\include\s*\{([^{}]*)\}/g

// Characters that can reach TeX code or a command line are refused. Spaces are
// allowed inside a name because students have files like "my chapter.tex".
const SAFE_CHAPTER = /^[A-Za-z0-9_][A-Za-z0-9_\-. /]*$/

function stripComment(line) {
  return line.replace(/(^|[^\\])%.*$/, '$1')
}

/**
 * Whether a chapter name can be put into \includeonly. It must be a relative
 * path without "..", a trailing separator or dot, or a .tex extension (the
 * argument has to match the \include argument exactly).
 *
 * @param {unknown} name
 * @returns {boolean}
 */
export function isSafeChapter(name) {
  return (
    typeof name === 'string' &&
    name.length <= 200 &&
    SAFE_CHAPTER.test(name) &&
    !name.includes('..') &&
    !name.includes('//') &&
    !/[ /.]$/.test(name) &&
    !name.endsWith('.tex')
  )
}

/**
 * The \include arguments of a root file, in order, without repeats.
 * Commented-out lines and unsafe names are left out.
 *
 * @param {string} rootText
 * @returns {string[]}
 */
export function listChapters(rootText) {
  const chapters = []
  for (const line of rootText.split('\n')) {
    for (const match of stripComment(line).matchAll(INCLUDE)) {
      const name = match[1].trim()
      if (isSafeChapter(name) && !chapters.includes(name)) {
        chapters.push(name)
      }
    }
  }
  return chapters
}
