// Publishes the IIT Mandi templates to the template gallery.
//
// Run inside the app container (the template gallery must be enabled):
//
//   cd /overleaf/services/web
//   node modules/iitmandi-templates/scripts/publish-templates.mjs \
//     --owner=templates@iitmandi.ac.in [--only=thesis,cv] [--keep-projects] [--dry-run]
//
// With the Toolkit:
//   bin/run-script modules/iitmandi-templates/scripts/publish-templates.mjs --owner=...
//
// For each template it builds a project owned by --owner, compiles it, and
// publishes it under the name in its template.json. A template that already
// exists with that name gets a new version, so re-running the script updates
// the gallery instead of duplicating it. The owner must be the template's
// owner, an admin, or the user in OVERLEAF_TEMPLATES_USER_ID. The temporary
// projects are deleted afterwards unless --keep-projects is given.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import archiver from 'archiver'
import minimist from 'minimist'
import { assembleTemplate, listTemplateIds, readTemplate } from './assemble.mjs'

const filename = fileURLToPath(import.meta.url)

// The web app's modules are imported lazily, so that --help and argument
// errors do not need a database connection, and so tests can inject fakes.
async function loadServices() {
  const web = path.resolve(path.dirname(filename), '../../..')
  const load = async relative =>
    (await import(pathToFileURL(path.join(web, relative)).href)).default
  return {
    UserGetter: await load('app/src/Features/User/UserGetter.mjs'),
    ProjectUploadManager: await load('app/src/Features/Uploads/ProjectUploadManager.mjs'),
    ProjectOptionsHandler: await load('app/src/Features/Project/ProjectOptionsHandler.mjs'),
    ProjectRootDocManager: await load('app/src/Features/Project/ProjectRootDocManager.mjs'),
    ProjectDeleter: await load('app/src/Features/Project/ProjectDeleter.mjs'),
    CompileManager: await load('app/src/Features/Compile/CompileManager.mjs'),
    TemplateGalleryManager: await load(
      'modules/template-gallery/app/src/TemplateGalleryManager.mjs'
    ),
  }
}

export function parseArgs(argv) {
  const args = minimist(argv, {
    string: ['owner', 'only'],
    boolean: ['keep-projects', 'dry-run', 'help'],
  })
  const ids = args.only
    ? args.only.split(',').map(id => id.trim()).filter(Boolean)
    : listTemplateIds()
  const known = listTemplateIds()
  const unknown = ids.filter(id => !known.includes(id))
  if (unknown.length) {
    throw new Error(`unknown template(s): ${unknown.join(', ')}`)
  }
  return {
    owner: args.owner,
    ids,
    keepProjects: args['keep-projects'],
    dryRun: args['dry-run'],
    help: args.help,
  }
}

async function zipDirectory(dir, zipPath) {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip')
    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(dir, false)
    archive.finalize()
  })
}

// Publishes one template; returns a short description of what happened.
export async function publishTemplate(services, { id, ownerId, keepProject, workDir }) {
  const {
    ProjectUploadManager,
    ProjectOptionsHandler,
    ProjectRootDocManager,
    ProjectDeleter,
    CompileManager,
    TemplateGalleryManager,
  } = services

  const projectDir = path.join(workDir, id)
  const { metadata } = assembleTemplate(id, projectDir)
  const zipPath = path.join(workDir, `${id}.zip`)
  await zipDirectory(projectDir, zipPath)

  const { project } =
    await ProjectUploadManager.promises.createProjectFromZipArchiveWithName(
      ownerId,
      metadata.name,
      zipPath
    )
  const projectId = project._id.toString()
  try {
    await ProjectOptionsHandler.promises.setCompiler(projectId, metadata.compiler)
    await ProjectRootDocManager.promises.setRootDocFromName(
      projectId,
      metadata.mainFile
    )

    const { status, buildId } = await CompileManager.promises.compile(
      projectId,
      ownerId,
      {}
    )
    if (status !== 'success' || !buildId) {
      throw new Error(`${id}: compile finished with status "${status}"`)
    }

    const result = await TemplateGalleryManager.createTemplateFromProject({
      projectId,
      userId: ownerId,
      templateSource: {
        name: metadata.name,
        category: metadata.category,
        descriptionMD: metadata.description,
        authorMD: metadata.author,
        license: metadata.license,
        build: buildId,
        override: true,
      },
    })
    if (result.conflict) {
      throw new Error(
        `${id}: a template named "${metadata.name}" belongs to ${result.templateOwnerName}; run as that user or an admin`
      )
    }
    return `${id}: published "${metadata.name}" (template ${result.templateId})`
  } finally {
    if (!keepProject) {
      await ProjectDeleter.promises.deleteProject(projectId)
    }
  }
}

export async function main(argv = process.argv.slice(2), services = null) {
  const options = parseArgs(argv)
  if (options.help || !options.owner) {
    console.error(
      `Usage: node ${filename} --owner=<email> [--only=id1,id2] [--keep-projects] [--dry-run]\n` +
        `Templates: ${listTemplateIds().join(', ')}`
    )
    return options.help ? 0 : 2
  }

  if (options.dryRun) {
    for (const id of options.ids) {
      const { metadata } = readTemplate(id)
      console.log(`${id}: would publish "${metadata.name}" (${metadata.category}, ${metadata.compiler})`)
    }
    return 0
  }

  services = services || (await loadServices())
  const owner = await services.UserGetter.promises.getUserByMainEmail(
    options.owner,
    { _id: 1 }
  )
  if (!owner) {
    console.error(`No user with the email ${options.owner}`)
    return 1
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iitmandi-templates-'))
  let failures = 0
  try {
    for (const id of options.ids) {
      try {
        console.log(
          await publishTemplate(services, {
            id,
            ownerId: owner._id.toString(),
            keepProject: options.keepProjects,
            workDir,
          })
        )
      } catch (error) {
        failures++
        console.error(`${id}: failed: ${error.message}`)
      }
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
  return failures ? 1 : 0
}

if (filename === process.argv[1]) {
  try {
    process.exit(await main())
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}
