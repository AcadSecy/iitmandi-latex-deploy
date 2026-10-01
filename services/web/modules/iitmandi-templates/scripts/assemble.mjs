// Assembles the IIT Mandi templates into self-contained project folders.
//
// Each folder in ../templates (except "shared") is one template. Its
// template.json describes it for the gallery and lists the files it needs from
// ../templates/shared, which are copied in next to its own files.
//
//   node assemble.mjs <outDir> [templateId ...]
//
// writes <outDir>/<templateId>/ for each template (all of them by default) and
// prints one line per template: "<id> <compiler> <mainFile>".

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TEMPLATES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../templates'
)
const SHARED_DIR = path.join(TEMPLATES_DIR, 'shared')
const METADATA_FILE = 'template.json'

const REQUIRED_FIELDS = [
  'name',
  'category',
  'description',
  'license',
  'mainFile',
  'compiler',
]
const COMPILERS = ['pdflatex', 'xelatex', 'lualatex', 'latex']
const LICENSES = ['cc_by_4.0', 'lppl_1.3c', 'other']

export function listTemplateIds() {
  return fs
    .readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== 'shared')
    .map(entry => entry.name)
    .sort()
}

export function readTemplate(id) {
  const dir = path.join(TEMPLATES_DIR, id)
  const metadata = JSON.parse(
    fs.readFileSync(path.join(dir, METADATA_FILE), 'utf8')
  )
  for (const field of REQUIRED_FIELDS) {
    if (!metadata[field]) {
      throw new Error(`${id}/${METADATA_FILE}: missing "${field}"`)
    }
  }
  if (!COMPILERS.includes(metadata.compiler)) {
    throw new Error(`${id}: unknown compiler "${metadata.compiler}"`)
  }
  if (!LICENSES.includes(metadata.license)) {
    throw new Error(`${id}: unknown license "${metadata.license}"`)
  }
  const shared = metadata.shared || []
  for (const file of shared) {
    if (!fs.existsSync(path.join(SHARED_DIR, file))) {
      throw new Error(`${id}: shared file "${file}" does not exist`)
    }
  }
  if (!fs.existsSync(path.join(dir, metadata.mainFile))) {
    throw new Error(`${id}: main file "${metadata.mainFile}" does not exist`)
  }
  return { id, dir, metadata: { ...metadata, shared } }
}

// Copies the template's own files and its shared files into outDir.
export function assembleTemplate(id, outDir) {
  const template = readTemplate(id)
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })
  fs.cpSync(template.dir, outDir, {
    recursive: true,
    filter: source => path.basename(source) !== METADATA_FILE,
  })
  for (const file of template.metadata.shared) {
    fs.copyFileSync(path.join(SHARED_DIR, file), path.join(outDir, file))
  }
  return template
}

function main() {
  const [outDir, ...ids] = process.argv.slice(2)
  if (!outDir) {
    console.error('Usage: node assemble.mjs <outDir> [templateId ...]')
    process.exit(2)
  }
  for (const id of ids.length ? ids : listTemplateIds()) {
    const { metadata } = assembleTemplate(id, path.join(outDir, id))
    console.log(`${id} ${metadata.compiler} ${metadata.mainFile}`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main()
}
