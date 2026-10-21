import ProjectGetter from '../../../../app/src/Features/Project/ProjectGetter.mjs'
import ProjectEntityHandler from '../../../../app/src/Features/Project/ProjectEntityHandler.mjs'
import { listChapters } from './Chapters.mjs'

/**
 * The chapters of a project: the \include arguments of its root document that
 * name an existing .tex document.
 *
 * @param {string} projectId
 * @returns {Promise<string[]>}
 */
async function getChapters(projectId) {
  const project = await ProjectGetter.promises.getProject(projectId, {
    rootDoc_id: 1,
  })
  if (!project?.rootDoc_id) return []
  const docs = await ProjectEntityHandler.promises.getAllDocs(projectId)
  const rootDoc = Object.values(docs).find(
    doc => doc._id.toString() === project.rootDoc_id.toString()
  )
  if (!rootDoc) return []
  return listChapters(rootDoc.lines.join('\n')).filter(
    chapter => docs[`/${chapter}.tex`] != null
  )
}

/**
 * Whether a compile request may ask for this chapter alone.
 *
 * @param {string} projectId
 * @param {string} chapter
 * @returns {Promise<boolean>}
 */
async function hasChapter(projectId, chapter) {
  return (await getChapters(projectId)).includes(chapter)
}

export default { getChapters, hasChapter }
