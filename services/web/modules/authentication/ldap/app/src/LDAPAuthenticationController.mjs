import logger from '@overleaf/logger'
import passport from 'passport'
import Settings from '@overleaf/settings'
import EmailHelper from '../../../../../app/src/Features/Helpers/EmailHelper.mjs'
import { handleAuthenticateErrors } from '../../../../../app/src/Features/Authentication/AuthenticationErrors.mjs'
import AuthenticationController from '../../../../../app/src/Features/Authentication/AuthenticationController.mjs'
import LDAPAuthenticationManager from './LDAPAuthenticationManager.mjs'

function campusLoginFailure(req, res, status = 401) {
  return res.status(status).json({
    message: {
      type: 'error',
      text: req.i18n.translate('email_or_password_wrong_try_again'),
    },
  })
}

const LDAPAuthenticationController = {
  passportLogin(req, res, next) {
    // This function is middleware which wraps the passport.authenticate middleware,
    // so we can send back our custom `{message: {text: "", type: ""}}` responses on failure,
    // and send a `{redir: ""}` response on success
    const campus = req.body.ldapProvider === 'campus'
    if (campus && !Settings.ldap.campusEnabled) {
      return campusLoginFailure(req, res)
    }
    const method = campus ? 'Campus LDAP password login' : 'LDAP password login'
    let finished = false
    passport.authenticate(
      campus ? 'campus-ldap' : 'ldapauth',
      { keepSessionInfo: true },
      async function (err, user, info, status) {
        // A directory connection failure can reach Passport through two callbacks.
        if (finished) return
        finished = true
        if (err) { //we cannot be here as long as errors are treated as fails
          return next(err)
        }
        if (user) {
          // `user` is either a user object or false
          AuthenticationController.setAuditInfo(req, {
            method,
          })

          try {
            await AuthenticationController.promises.finishLogin(user, req, res)
	    res.status(200)
	    return
          } catch (err) {
            return next(err)
          }
        } else {
          info ??= {}
          if (!campus && status != 401) {
            logger.warn(status, 'LDAP: ' + info.message)
          }
          if (!campus && EmailHelper.parseEmail(req.body.email)) return next()
          if (campus) {
            if (info.errorReason === 'cannot_verify_user_not_robot') {
              return res.status(400).json({
                message: { text: info.text, type: 'error' },
                errorReason: info.errorReason,
              })
            }
            return campusLoginFailure(req, res, info.status === 429 ? 429 : 401)
          }
          if (info.redir != null) {
            return res.json({ redir: info.redir })
          } else {
            res.status(status || info.status || 401)
            delete info.status
            info.type = 'error'
            info.key = 'invalid-password-retry-or-reset'
            const body = { message: info }
            const { errorReason } = info
            if (errorReason) {
              body.errorReason = errorReason
              delete info.errorReason
            }
            return res.json(body)
          }
        }
      }
    )(req, res, next)
  },
  doCampusPassportLogin(req, profile, done) {
    return LDAPAuthenticationController.doPassportLogin(req, profile, done, true)
  },
  async doPassportLogin(req, profile, done, campus = false) {
    let user, info
    try {
      ;({ user, info } = await LDAPAuthenticationController._doPassportLogin(
        req,
        profile,
        campus
      ))
    } catch (error) {
      return done(error)
    }
    return done(undefined, user, info)
  },
  async _doPassportLogin(req, profile, campus) {
    const method = campus ? 'Campus LDAP password login' : 'LDAP password login'
    const { fromKnownDevice } = AuthenticationController.getAuditInfo(req)
    const auditLog = {
      ipAddress: req.ip,
      info: { method, fromKnownDevice },
    }

    let user
    try {
      user = await LDAPAuthenticationManager.promises.findOrCreateUser(profile, auditLog, campus)
    } catch (error) {
      return {
        user: false,
        info: handleAuthenticateErrors(error, req),
      }
    }
    if (user && AuthenticationController.captchaRequiredForLogin(req, user)) {
      return {
        user: false,
        info: {
          text: req.i18n.translate('cannot_verify_user_not_robot'),
          type: 'error',
          errorReason: 'cannot_verify_user_not_robot',
          status: 400,
        },
      }
    } else if (user) {
      user.externalAuth = 'ldap'
      return { user, info: undefined }
    } else {
      return {
        user: false,
        info: {
          type: 'error',
          text: req.i18n.translate('email_or_password_wrong_try_again'),
          status: 401,
        },
      }
    }
  },
}

export default LDAPAuthenticationController
