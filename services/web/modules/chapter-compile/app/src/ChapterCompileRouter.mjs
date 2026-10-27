import logger from '@overleaf/logger'
import AuthorizationMiddleware from '../../../../app/src/Features/Authorization/AuthorizationMiddleware.mjs'
import ChapterCompile from './ChapterCompile.mjs'

let applied = false

async function sendChapters(req, res) {
  const chapters = await ChapterCompile.getChapters(req.params.Project_id)
  res.json({ chapters })
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
