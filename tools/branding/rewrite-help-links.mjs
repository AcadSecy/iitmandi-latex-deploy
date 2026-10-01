// Points links to the upstream project's website (its docs, help library,
// blog and so on) at our own help page, so that users never land on another
// product's site. Links about a specific LaTeX error go to a TeX Stack
// Exchange search for that error instead. Run it again after merging upstream
// changes; it only touches lines that need it.
//
//   node tools/branding/rewrite-help-links.mjs           rewrite the files
//   node tools/branding/rewrite-help-links.mjs --check   exit 1 if any link needs rewriting
//
// Only browser code and page templates are rewritten, where a relative link
// to /learn works. Server code (email templates, the example project) needs
// absolute links, so links there are reported to be fixed by hand. Comments,
// tests and admin scripts are left alone: users never see them (a few
// frontend tests that check these links were updated by hand).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../services/web'
)

const ROOTS = ['app', 'frontend', 'modules', 'types']
const EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.pug',
  '.tex',
])
const SKIP_DIRS = new Set([
  'node_modules',
  'test',
  'tests',
  'stories',
  'scripts',
])
const SKIP_FILES = /\.(test|spec|stories)\.[cm]?[jt]sx?$/
// The hosted service's example project; this platform uses example-project-sp
const SKIP_PATHS = /^app\/templates\/project_files\/example-project\//
const SERVER_CODE = /^(app\/(src|templates)|modules\/[^/]+\/app\/src)\//
const COMMENT = /^\s*(\/\/|\/\*|\*)/

const URL_PATTERN =
  /https?:\/\/(?:[a-z0-9-]+\.)*overleaf\.com(?:\/[^\s"'`)<>\\${}]*)?/gi

function replacement(url) {
  const { pathname } = new URL(url)
  const error = /^\/learn\/(?:latex\/)?Errors\/(.+)$/.exec(pathname)
  if (error) {
    const words = decodeURIComponent(error[1])
      .replace(/_/g, ' ')
      .replace(/\bXXX\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return `https://tex.stackexchange.com/search?q=${encodeURIComponent(words)}`
  }
  return pathname === '/' ? '/' : '/learn'
}

function* sourceFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        yield* sourceFiles(path.join(dir, entry.name))
      }
    } else if (
      EXTENSIONS.has(path.extname(entry.name)) &&
      !SKIP_FILES.test(entry.name)
    ) {
      yield path.join(dir, entry.name)
    }
  }
}

const check = process.argv.includes('--check')
let toRewrite = 0
let byHand = 0

for (const root of ROOTS) {
  for (const file of sourceFiles(path.join(WEB, root))) {
    const relative = path.relative(WEB, file).split(path.sep).join('/')
    if (SKIP_PATHS.test(relative)) continue
    const serverCode = SERVER_CODE.test(relative)
    let changed = 0
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    const out = lines.map(line => {
      if (COMMENT.test(line)) return line
      const links = line.match(URL_PATTERN)
      if (!links) return line
      for (const link of links) {
        console.log(`${relative}: ${serverCode ? 'fix by hand: ' : ''}${link}`)
      }
      if (serverCode) {
        byHand += links.length
        return line
      }
      changed += links.length
      return line.replace(URL_PATTERN, replacement)
    })
    if (changed && !check) fs.writeFileSync(file, out.join('\n'))
    toRewrite += changed
  }
}

if (toRewrite) {
  console.error(
    check
      ? `\n${toRewrite} links point at the upstream website. Run: node tools/branding/rewrite-help-links.mjs`
      : `\nRewrote ${toRewrite} links.`
  )
}
if (byHand) {
  console.error(
    `\n${byHand} links in server code point at the upstream website. Replace them by hand with \${settings.siteUrl}/learn.`
  )
}
if ((check && toRewrite) || byHand) process.exit(1)
