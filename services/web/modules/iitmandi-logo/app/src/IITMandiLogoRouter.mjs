import logger from '@overleaf/logger'
import AuthenticationController from '../../../../app/src/Features/Authentication/AuthenticationController.mjs'
import AuthorizationMiddleware from '../../../../app/src/Features/Authorization/AuthorizationMiddleware.mjs'
import AsyncLocalStorage from '../../../../app/src/infrastructure/AsyncLocalStorage.mjs'
import IITMandiLogoController from './IITMandiLogoController.mjs'

let applied = false

export default {
  apply(webRouter) {
    // router.mjs applies module routers more than once
    if (applied) return
    applied = true
    logger.debug({}, 'Init IIT Mandi logo module')

    webRouter.post(
      '/project/:Project_id/iitmandi-logo',
      AuthenticationController.requireLogin(),
      AsyncLocalStorage.middleware,
      AuthorizationMiddleware.ensureUserCanWriteProjectContent,
      IITMandiLogoController.addLogo
    )
  },
}
