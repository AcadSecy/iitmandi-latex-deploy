import logger from '@overleaf/logger'
import AuthenticationController from '../../../../app/src/Features/Authentication/AuthenticationController.mjs'
import AuthorizationMiddleware from '../../../../app/src/Features/Authorization/AuthorizationMiddleware.mjs'
import AsyncLocalStorage from '../../../../app/src/infrastructure/AsyncLocalStorage.mjs'
import SessionManager from '../../../../app/src/Features/Authentication/SessionManager.mjs'
import StorageQuotaController from './StorageQuotaController.mjs'

let applied = false

// Hand requests from logged-out visitors straight to the existing route,
// which asks them to log in (a JSON 401 for the uploader) rather than
// redirecting them as the permission check below would.
function skipIfLoggedOut(req, res, next) {
  next(SessionManager.isUserLoggedIn(req.session) ? undefined : 'route')
}

export default {
  apply(webRouter) {
    // router.mjs applies module routers more than once. Register on the first
    // pass only, which comes before the routes these checks guard; each check
    // calls next() to hand over to them.
    if (applied) return
    applied = true
    logger.debug({}, 'Init storage quota module')

    // Check the user may write to the project before telling them anything
    // about the owner's quota
    const canWrite = [
      skipIfLoggedOut,
      AsyncLocalStorage.middleware,
      AuthorizationMiddleware.ensureUserCanWriteProjectContent,
    ]

    webRouter.post(
      '/Project/:Project_id/upload',
      ...canWrite,
      StorageQuotaController.checkFileUpload
    )
    webRouter.post(
      '/project/:project_id/linked_file',
      ...canWrite,
      StorageQuotaController.checkLinkedFile
    )
    webRouter.post(
      '/project/:project_id/linked_file/:file_id/refresh',
      ...canWrite,
      StorageQuotaController.checkLinkedFile
    )
    webRouter.post(
      '/project/new/upload',
      AuthenticationController.requireLogin(),
      StorageQuotaController.checkProjectUpload
    )
    webRouter.post(
      '/Project/:Project_id/clone',
      AuthenticationController.requireLogin(),
      AsyncLocalStorage.middleware,
      AuthorizationMiddleware.ensureUserCanReadProject,
      StorageQuotaController.checkClone
    )

    webRouter.get(
      '/user/storage',
      AuthenticationController.requireLogin(),
      StorageQuotaController.getUserStorage
    )
    webRouter.get(
      '/user/storage/projects',
      AuthenticationController.requireLogin(),
      StorageQuotaController.getUserProjectSizes
    )
  },
}
