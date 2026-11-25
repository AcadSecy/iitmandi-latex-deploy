import Settings from '@overleaf/settings'
import { expressify } from '@overleaf/promise-utils'
import SessionManager from '../../../../app/src/Features/Authentication/SessionManager.mjs'
import AuthorizationManager from '../../../../app/src/Features/Authorization/AuthorizationManager.mjs'
import CollaboratorsGetter from '../../../../app/src/Features/Collaborators/CollaboratorsGetter.mjs'
import AsyncLocalStorage from '../../../../app/src/infrastructure/AsyncLocalStorage.mjs'
import RedisWrapper from '../../../../app/src/infrastructure/RedisWrapper.mjs'
import {
  AssistanceError,
  createAssistanceService,
} from './AssistanceService.mjs'

let redis
const service = createAssistanceService({
  getConfig: () => Settings.askAi?.managed,
  getRedis: () => (redis ||= RedisWrapper.client('aiAssistance')),
})

// Authorization runs before reading context or reserving any budget. Explicit
// membership is required: a public/share-link project is not a paid API grant.
export async function requireMember(req, res, next) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (!userId) return res.status(401).json({ code: 'login_required' })
  const projectId = req.params.Project_id
  const privilege =
    await AuthorizationManager.promises.getPrivilegeLevelForProject(
      userId,
      projectId,
      null,
      { ignorePublicAccess: true }
    )
  if (
    !['owner', 'readAndWrite', 'readOnly', 'review'].includes(privilege) ||
    (privilege !== 'owner' &&
      !(await CollaboratorsGetter.promises.isUserInvitedMemberOfProject(
        userId,
        projectId
      )))
  ) {
    return res.status(403).json({ code: 'permission_denied' })
  }
  if (
    req.method === 'POST' &&
    req.body?.kind === 'selection' &&
    !['owner', 'readAndWrite'].includes(privilege)
  ) {
    return res.status(403).json({ code: 'permission_denied' })
  }
  res.set('Cache-Control', 'no-store')
  next()
}

async function suggest(req, res) {
  try {
    res.json(
      await service.suggest(
        SessionManager.getLoggedInUserId(req.session),
        req.body
      )
    )
  } catch (error) {
    // Never put a provider error (which may echo the submitted text/key) into
    // the application logger or exception reporter.
    const known = error instanceof AssistanceError
    res
      .status(known ? error.status : 503)
      .json({ code: known ? error.code : 'unavailable' })
  }
}

let applied = false
export default {
  apply(webRouter) {
    if (applied) return
    applied = true
    const middleware = [AsyncLocalStorage.middleware, expressify(requireMember)]
    webRouter.get(
      '/project/:Project_id([0-9a-f]{24})/ai-assistance/config',
      ...middleware,
      (req, res) => res.json(service.config())
    )
    webRouter.post(
      '/project/:Project_id([0-9a-f]{24})/ai-assistance/suggest',
      ...middleware,
      expressify(suggest)
    )
  },
}
