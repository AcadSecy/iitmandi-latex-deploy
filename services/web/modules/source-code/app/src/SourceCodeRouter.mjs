import logger from '@overleaf/logger'
import AuthenticationController from '../../../../app/src/Features/Authentication/AuthenticationController.mjs'
import RateLimiterMiddleware from '../../../../app/src/Features/Security/RateLimiterMiddleware.mjs'
import { RateLimiter } from '../../../../app/src/infrastructure/RateLimiter.mjs'
import SourceCodeController from './SourceCodeController.mjs'

// The archive is about 40 MB; nobody needs it more than a few times an hour.
const downloadRateLimiter = new RateLimiter('source-code-download', {
  points: 10,
  duration: 60 * 60,
})

let applied = false

export default {
  apply(webRouter) {
    // router.mjs applies module routers more than once
    if (applied) return
    applied = true
    logger.debug({}, 'Init source code module')

    // Users of the platform are the people the AGPL entitles to the source,
    // so the download needs a login like the rest of the platform.
    webRouter.get(
      '/source',
      AuthenticationController.requireLogin(),
      RateLimiterMiddleware.rateLimit(downloadRateLimiter),
      SourceCodeController.download
    )
  },
}
