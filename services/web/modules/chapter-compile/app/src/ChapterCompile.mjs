import Path from 'node:path'
import DocumentUpdaterHandler from '../../../../app/src/Features/DocumentUpdater/DocumentUpdaterHandler.mjs'
import ProjectGetter from '../../../../app/src/Features/Project/ProjectGetter.mjs'
import ProjectEntityHandler from '../../../../app/src/Features/Project/ProjectEntityHandler.mjs'
import { listChapters } from './Chapters.mjs'

/**
 * The chapters of a project: the \include arguments of its root document that
 * name an existing .tex document.
 *
 * @param {string} projectId
 * @param {string} [rootDocId] the root document of the compile, if overridden
 * @returns {Promise<string[]>}
 */
async function getChapters(projectId, rootDocId) {
  // read what the editors see now, not what was last saved
  await DocumentUpdaterHandler.promises.flushProjectToMongo(projectId)
  if (!rootDocId) {
    const project = await ProjectGetter.promises.getProject(projectId, {
      rootDoc_id: 1,
    })
    rootDocId = project?.rootDoc_id
  }
  if (!rootDocId) return []
  const docs = await ProjectEntityHandler.promises.getAllDocs(projectId)
  const rootPath = Object.keys(docs).find(
    path => docs[path]._id.toString() === rootDocId.toString()
  )
  if (!rootPath) return []
  // latexmk runs with -cd, so \include paths start at the root file's folder
  const rootFolder = Path.posix.dirname(rootPath)
  return listChapters(docs[rootPath].lines.join('\n')).filter(
    chapter => docs[Path.posix.join(rootFolder, `${chapter}.tex`)] != null
  )
}

/**
 * Whether a compile may ask for this chapter alone.
 *
 * @param {string} projectId
 * @param {string} chapter
 * @param {string} [rootDocId]
 * @returns {Promise<boolean>}
 */
async function hasChapter(projectId, chapter, rootDocId) {
  return (await getChapters(projectId, rootDocId)).includes(chapter)
}

export default { getChapters, hasChapter }
