// Replaces the upstream product name in locale strings with the __appName__
// placeholder, so the UI shows settings.appName instead. Run it again after
// merging upstream changes; it only touches lines that need it.
//
//   node tools/branding/rebrand-locales.mjs           rewrite the locale files
//   node tools/branding/rebrand-locales.mjs --check   exit 1 if any string needs rewriting
//
// Keys, URLs, domains and email addresses are left alone, and each file keeps
// its exact formatting (the files are edited line by line, not re-serialised).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LOCALES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../services/web/locales'
)

// In these strings the name is a literal identifier (the Zotero collection
// that the sync looks for), so it must not change.
const EXCLUDE = new Set([
  'zotero_sync_multiple_collections',
  'zotero_sync_no_collection',
])

const LINE = /^(\s*"((?:[^"\\]|\\.)*)"\s*:\s*")(.*)("\s*,?\s*)$/
const NAME = /(?<![\w/.@])[Oo]verleaf(?![\w-]*\.(?:com|org|net)\b)(?!\/)/g

const check = process.argv.includes('--check')
let total = 0

for (const file of fs.readdirSync(LOCALES).filter(f => f.endsWith('.json'))) {
  const filePath = path.join(LOCALES, file)
  const lines = fs.readFileSync(filePath, 'utf8').split('\n')
  let changed = 0
  const out = lines.map(line => {
    const m = LINE.exec(line)
    if (!m || EXCLUDE.has(m[2])) return line
    const value = m[3].replace(NAME, '__appName__')
    if (value === m[3]) return line
    changed++
    if (check) console.log(`${file}: "${m[2]}" mentions the upstream name`)
    return m[1] + value + m[4]
  })
  if (changed && !check) {
    const text = out.join('\n')
    JSON.parse(text) // never write an invalid file
    fs.writeFileSync(filePath, text)
    console.log(`${file}: rewrote ${changed} strings`)
  }
  total += changed
}

if (check && total) {
  console.error(
    `\n${total} locale strings mention the upstream name. Run: node tools/branding/rebrand-locales.mjs`
  )
  process.exit(1)
}
console.log(check ? 'Locale strings are rebranded.' : `Done (${total} strings).`)
