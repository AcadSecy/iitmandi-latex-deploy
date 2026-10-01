import logger from '@overleaf/logger'
import AuthenticationController from '../../../../app/src/Features/Authentication/AuthenticationController.mjs'
import AuthorizationMiddleware from '../../../../app/src/Features/Authorization/AuthorizationMiddleware.mjs'
import EditorWaitingRoomController from './EditorWaitingRoomController.mjs'

let applied = false

export default {
  apply(webRouter) {
    // router.mjs applies module routers more than once. Register on the first
    // pass only, which comes before the editor route.
    if (applied) return
    applied = true
    logger.debug({}, 'Init editor waiting room module')

    // The editor itself; the detached PDF view does not take a place
    webRouter.get(
      '/Project/:Project_id([0-9a-f]{24})',
      EditorWaitingRoomController.openEditor
    )

    webRouter.post(
      '/editor-places/check',
      AuthenticationController.requireLogin(),
      EditorWaitingRoomController.checkPlace
    )

    webRouter.get(
      '/admin/editor-places',
      AuthenticationController.requireLogin(),
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      EditorWaitingRoomController.getStats
    )
  },
}
