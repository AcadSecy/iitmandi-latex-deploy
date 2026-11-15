import logger from '@overleaf/logger'
import Settings from '@overleaf/settings'
import AuthenticationController from '../../../../app/src/Features/Authentication/AuthenticationController.mjs'
import ReportProblemController from './ReportProblemController.mjs'

let applied = false

export default {
  apply(webRouter) {
    // router.mjs applies module routers more than once
    if (applied) return
    applied = true
    logger.debug({}, 'Init support module')

    AuthenticationController.addEndpointToLoginWhitelist('/report-problem')
    AuthenticationController.addEndpointToLoginWhitelist('/report-problem/email')
    webRouter.get('/report-problem', ReportProblemController.showReport)
    webRouter.get('/report-problem/email', ReportProblemController.sendReport)

    // The footer shows on the login page too, so people who cannot log in
    // find the link. Footer links set in OVERLEAF_LEFT_FOOTER stay first.
    Settings.nav.left_footer = [
      ...(Settings.nav.left_footer || []),
      { text: 'report_a_problem', url: '/report-problem' },
    ]
  },
}
