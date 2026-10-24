// Picks XeLaTeX or LuaLaTeX for documents that cannot compile with pdfLaTeX.
//
// pdfLaTeX is every project's default compiler, and a document that loads
// fontspec, polyglossia or unicode-math stops under it with "The fontspec
// package requires either XeTeX or LuaTeX", which few students know how to
// act on. Such documents are compiled with the engine they need instead; the
// web app then makes that the project's compiler and tells the user. A
// "% !TEX program = xelatex" line (the convention of TeXShop, TeXstudio and
// VS Code) names the engine outright.
import fsPromises from 'node:fs/promises'

// Only the start of the root file is read: the preamble and the magic comment
// are there
const READ_BYTES = 64 * 1024

const ENGINES = ['pdflatex', 'latex', 'xelatex', 'lualatex']
const MAGIC = /^\s*%\s*!\s*TEX\s+(?:TS-)?program\s*=\s*([a-z]+)/im
const UNICODE_PACKAGES = ['fontspec', 'polyglossia', 'unicode-math', 'xltxtra', 'xunicode']
const LUA_PACKAGES = ['luacode', 'luatextra', 'luatexbase', 'luaotfload']

function stripComments(text) {
  return text.replace(/(^|[^\\])%.*$/gm, '$1')
}

function loadedPackages(preamble) {
  const names = []
  const pattern = /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g
  for (const [, list] of preamble.matchAll(pattern)) {
    for (const name of list.split(',')) names.push(name.trim())
  }
  return names
}

/**
 * The engine a document needs, from the text of its root file, and why:
 * `{ engine: 'xelatex', reason: 'fontspec' }` (the package that needs it),
 * `{ engine, reason: 'magic-comment' }`, or null when pdfLaTeX will do.
 *
 * @param {string} text
 * @return {{engine: string, reason: string} | null}
 */
export function detectEngine(text) {
  const magic = text.match(MAGIC)
  if (magic && ENGINES.includes(magic[1].toLowerCase())) {
    return { engine: magic[1].toLowerCase(), reason: 'magic-comment' }
  }
  const code = stripComments(text)
  const begin = code.indexOf('\\begin{document}')
  const preamble = begin === -1 ? code : code.slice(0, begin)
  const packages = loadedPackages(preamble)
  const lua = packages.find(name => LUA_PACKAGES.includes(name))
  if (lua) {
    return { engine: 'lualatex', reason: lua }
  }
  if (/\\directlua\b/.test(preamble)) {
    return { engine: 'lualatex', reason: '\\directlua' }
  }
  const unicode = packages.find(name => UNICODE_PACKAGES.includes(name))
  if (unicode) {
    return { engine: 'xelatex', reason: unicode }
  }
  return null
}

/**
 * The compiler to use: the requested one, unless that is the default
 * pdfLaTeX and the root file needs another engine.
 *
 * @param {string} rootFilePath
 * @param {string} requested
 * @return {Promise<{compiler: string, reason?: string}>}
 */
export async function chooseCompiler(rootFilePath, requested) {
  if (requested !== 'pdflatex' || !rootFilePath.match(/\.tex$/i)) {
    return { compiler: requested }
  }
  let text
  try {
    const handle = await fsPromises.open(rootFilePath, 'r')
    try {
      const { buffer, bytesRead } = await handle.read(Buffer.alloc(READ_BYTES), 0, READ_BYTES, 0)
      text = buffer.subarray(0, bytesRead).toString('utf8')
    } finally {
      await handle.close()
    }
  } catch {
    return { compiler: requested }
  }
  const found = detectEngine(text)
  return found ? { compiler: found.engine, reason: found.reason } : { compiler: requested }
}

export default { detectEngine, chooseCompiler }
