import logger from '@overleaf/logger'
import AuthenticationController from '../../../../app/src/Features/Authentication/AuthenticationController.mjs'
import RetentionController from './RetentionController.mjs'

let applied = false

export default {
  apply(webRouter, privateApiRouter) {
    // router.mjs applies module routers more than once. Register on the first
    // pass only, which comes before the trash routes these notes go with;
    // each calls next() to hand over to them.
    if (applied) return
    applied = true
    logger.debug({}, 'Init retention module')

    webRouter.post(
      '/project/:project_id/trash',
      AuthenticationController.requireLogin(),
      RetentionController.noteTrashed
    )
    webRouter.delete(
      '/project/:project_id/trash',
      AuthenticationController.requireLogin(),
      RetentionController.noteRestored
    )

    privateApiRouter.post(
      '/internal/retention/run',
      AuthenticationController.requirePrivateApiAuth(),
      RetentionController.run
    )
  },
}
