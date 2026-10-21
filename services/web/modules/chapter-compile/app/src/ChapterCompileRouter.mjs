import logger from '@overleaf/logger'
import ProjectGetter from '../../../../app/src/Features/Project/ProjectGetter.mjs'
import ProjectEntityHandler from '../../../../app/src/Features/Project/ProjectEntityHandler.mjs'
import AuthorizationMiddleware from '../../../../app/src/Features/Authorization/AuthorizationMiddleware.mjs'
import { listChapters } from './Chapters.mjs'

let applied = false

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

async function sendChapters(req, res) {
  res.json({ chapters: await getChapters(req.params.Project_id) })
}

export default {
  apply(webRouter) {
    // router.mjs applies module routers more than once
    if (applied) return
    applied = true
    logger.debug({}, 'Init chapter compile module')

    webRouter.get(
      '/project/:Project_id/chapters',
      AuthorizationMiddleware.ensureUserCanReadProject,
      sendChapters
    )
  },
}
