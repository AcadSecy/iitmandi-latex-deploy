// For CI: writes page setup variants of assembled templates, to check that
// what the Page setup dialog writes compiles with the platform's TeX Live.
//
//   node page-setup-variants.mjs <templatesDir> < templates.txt > variants.txt
//
// Reads "<id> <compiler> <mainFile>" lines (from assemble.mjs) and writes
// pagesetup-<n>.tex next to each main file whose page setup can be changed,
// printing a line in the same format for each. Needs Node 23.6 or later,
// which runs TypeScript without a build step.

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import {
  applyPageSetup,
  hasPageSetup,
  readPageSetup,
} from '../frontend/js/preamble.ts'

const VARIANTS = [
  {
    fontSize: '12pt',
    paper: 'a4paper',
    margin: '2.5cm',
    spacing: 'double',
    font: 'times',
  },
  {
    fontSize: '11pt',
    paper: 'letterpaper',
    margin: '1in',
    spacing: 'onehalf',
    font: 'helvetica',
  },
]

const [templatesDir] = process.argv.slice(2)
if (!templatesDir) {
  console.error(`Usage: node ${import.meta.filename} <templatesDir>`)
  process.exit(101)
}

const lines = readline.createInterface({ input: process.stdin })
for await (const line of lines) {
  const [id, compiler, main] = line.trim().split(/\s+/)
  if (!id) continue
  const file = path.join(templatesDir, id, main)
  const text = fs.readFileSync(file, 'utf8')
  const info = readPageSetup(text)
  if (!info || !hasPageSetup(info.documentClass)) continue
  VARIANTS.forEach((variant, n) => {
    const changes = { ...variant }
    if (!info.fontEditable) delete changes.font
    const name = `pagesetup-${n + 1}.tex`
    fs.writeFileSync(
      path.join(templatesDir, id, name),
      applyPageSetup(text, changes)
    )
    console.log(`${id} ${compiler} ${name}`)
  })
}
