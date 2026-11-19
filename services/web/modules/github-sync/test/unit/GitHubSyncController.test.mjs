import { beforeEach, describe, expect, it, vi } from 'vitest'
import logger from '@overleaf/logger'
import HttpErrorHandler from '../../../../app/src/Features/Errors/HttpErrorHandler.mjs'
import Csrf from '../../../../app/src/infrastructure/Csrf.mjs'
import api from '../../app/src/GitHubApiClient.mjs'
import Controller from '../../app/src/GitHubSyncController.mjs'
import TokenManager from '../../app/src/TokenManager.mjs'
import MockResponse from '../../../../test/unit/src/helpers/MockResponse.mjs'

vi.mock('@overleaf/settings', () => ({ default: {} }))
vi.mock('../../../../app/src/Features/Errors/HttpErrorHandler.mjs', () => ({
  default: { badRequest: vi.fn(), forbidden: vi.fn() },
}))
vi.mock('../../../../app/src/Features/Authentication/SessionManager.mjs', () => ({
  default: { getLoggedInUserId: session => session.userId },
}))
vi.mock('../../../../app/src/infrastructure/Csrf.mjs', () => ({
  default: { promises: { validateToken: vi.fn() } },
}))
vi.mock('../../app/src/GitHubSyncHandler.mjs', () => ({ default: {} }))
vi.mock('../../app/src/GitMerge.mjs', () => ({ doGitMerge: vi.fn() }))
vi.mock('../../app/src/GitHubApiClient.mjs', () => ({
  default: { exchangeCodeForToken: vi.fn() },
}))
vi.mock('../../app/src/TokenManager.mjs', () => ({
  default: { saveUserToken: vi.fn(), removeUserToken: vi.fn() },
}))

describe('GitHubSyncController account connection', function () {
  beforeEach(function (ctx) {
    ctx.req = {
      session: { userId: 'student' },
      query: { code: 'test-code', state: 'test-state' },
      i18n: { translate: key => key },
    }
    ctx.res = new MockResponse(vi)
    ctx.next = vi.fn()
  })

  it('rejects a failed OAuth exchange with a generic error', async function ({ req, res, next }) {
    api.exchangeCodeForToken.mockRejectedValue(new Error('private exchange response'))

    await Controller.oauth2Callback(req, res, next)

    expect(HttpErrorHandler.badRequest).toHaveBeenCalledWith(
      req,
      res,
      'Failed to obtain access token from Git server'
    )
    expect(logger.error).toHaveBeenCalledWith(
      { userId: 'student' },
      'Failed to obtain access token from Git server'
    )
    expect(next).not.toHaveBeenCalled()
    expect(TokenManager.saveUserToken).not.toHaveBeenCalled()
  })

  it('rejects an invalid state before exchanging the code', async function ({ req, res, next }) {
    Csrf.promises.validateToken.mockRejectedValue(new Error('invalid state'))

    await Controller.oauth2Callback(req, res, next)

    expect(HttpErrorHandler.forbidden).toHaveBeenCalledWith(req, res, 'Invalid CSRF token')
    expect(api.exchangeCodeForToken).not.toHaveBeenCalled()
  })

  it('saves a successful exchange against the authenticated user', async function ({ req, res, next }) {
    api.exchangeCodeForToken.mockResolvedValue('mock-token')

    await Controller.oauth2Callback(req, res, next)

    expect(TokenManager.saveUserToken).toHaveBeenCalledWith('student', 'mock-token')
    expect(res.redirectedTo).to.equal('/user/settings?oauth-complete=github#project-sync')
  })

  it('returns a generic error when the local account could not be unlinked', async function ({ req, res, next }) {
    TokenManager.removeUserToken.mockRejectedValue(new Error('private database response'))

    await Controller.unlink(req, res, next)

    expect(res.statusCode).to.equal(500)
    expect(JSON.parse(res.body)).to.deep.equal({ message: 'Failed to unlink GitHub account' })
    expect(logger.error).toHaveBeenCalledWith(
      { userId: 'student' },
      'Error removing user credentials'
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('only unlinks the authenticated account', async function ({ req, res, next }) {
    req.body = { userId: 'another-student' }

    await Controller.unlink(req, res, next)

    expect(TokenManager.removeUserToken).toHaveBeenCalledWith('student')
    expect(res.statusCode).to.equal(200)
  })
})
