import assert from 'node:assert/strict'
import { describe, expect, it, vi } from 'vitest'
import logger from '@overleaf/logger'
import { GitHubSyncUserCredentials } from '../../app/models/githubSyncUserCredentials.mjs'
import { AccessTokenEncryptor } from '../../app/src/AccessTokenEncryptorHelper.mjs'
import api from '../../app/src/GitHubApiClient.mjs'
import { NotFoundError, PermissionDeniedError } from '../../app/src/GitSyncErrors.mjs'
import TokenManager from '../../app/src/TokenManager.mjs'

vi.mock('../../../../app/src/Features/Helpers/Mongo.mjs', () => ({
  default: { normalizeQuery: query => query },
}))
vi.mock('../../app/models/githubSyncUserCredentials.mjs', () => ({
  GitHubSyncUserCredentials: { findOne: vi.fn(), findOneAndDelete: vi.fn() },
}))
vi.mock('../../app/src/AccessTokenEncryptorHelper.mjs', () => ({
  AccessTokenEncryptor: { decryptToJson: vi.fn() },
}))
vi.mock('../../app/src/GitHubApiClient.mjs', () => ({
  default: { getPushPermission: vi.fn(), revokeToken: vi.fn() },
}))

describe('TokenManager.getProjectToken', function () {
  it('uses the requesting user’s credential when GitHub allows writing', async function () {
    GitHubSyncUserCredentials.findOne.mockResolvedValue({ github: 'encrypted-token' })
    AccessTokenEncryptor.decryptToJson.mockResolvedValue('student-token')
    api.getPushPermission.mockResolvedValue(true)

    expect(await TokenManager.getProjectToken('student', 'fixture/repo')).to.equal('student-token')
    expect(GitHubSyncUserCredentials.findOne).toHaveBeenCalledExactlyOnceWith({ userId: 'student' })
    expect(api.getPushPermission).toHaveBeenCalledExactlyOnceWith('student-token', 'fixture/repo')
  })

  it('treats GitHub’s private-repository response as a generic denial', async function () {
    GitHubSyncUserCredentials.findOne.mockResolvedValue({ github: 'encrypted-token' })
    AccessTokenEncryptor.decryptToJson.mockResolvedValue('student-token')
    api.getPushPermission.mockRejectedValue(new NotFoundError('private repository response'))

    await assert.rejects(
      TokenManager.getProjectToken('student', 'fixture/repo'),
      { name: PermissionDeniedError.name, message: 'GitHub repository write access is required' }
    )
  })
})

describe('TokenManager.removeUserToken', function () {
  it('revokes the token returned by the atomic removal', async function () {
    GitHubSyncUserCredentials.findOneAndDelete.mockResolvedValue({ github: 'encrypted-token' })
    AccessTokenEncryptor.decryptToJson.mockResolvedValue('old-token')
    api.revokeToken.mockResolvedValue(undefined)

    await TokenManager.removeUserToken('student')

    expect(GitHubSyncUserCredentials.findOneAndDelete).toHaveBeenCalledExactlyOnceWith({ userId: 'student' })
    expect(AccessTokenEncryptor.decryptToJson).toHaveBeenCalledExactlyOnceWith('encrypted-token')
    expect(api.revokeToken).toHaveBeenCalledExactlyOnceWith('old-token')
  })

  it('allows a repeated disconnect without contacting GitHub', async function () {
    GitHubSyncUserCredentials.findOneAndDelete.mockResolvedValue(null)

    await TokenManager.removeUserToken('student')

    expect(AccessTokenEncryptor.decryptToJson).not.toHaveBeenCalled()
    expect(api.revokeToken).not.toHaveBeenCalled()
  })

  it('keeps the local disconnect when GitHub rejects revocation', async function () {
    GitHubSyncUserCredentials.findOneAndDelete.mockResolvedValue({ github: 'encrypted-token' })
    AccessTokenEncryptor.decryptToJson.mockResolvedValue('mock-token')
    api.revokeToken.mockRejectedValue(new Error('private provider response'))

    await TokenManager.removeUserToken('student')

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      { userId: 'student' },
      'failed to revoke removed GitHub token'
    )
  })

  it('removes an unreadable credential without sending anything to GitHub', async function () {
    GitHubSyncUserCredentials.findOneAndDelete.mockResolvedValue({ github: 'unreadable' })
    AccessTokenEncryptor.decryptToJson.mockRejectedValue(new Error('private cipher response'))

    await TokenManager.removeUserToken('student')

    expect(api.revokeToken).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      { userId: 'student' },
      'failed to decrypt removed GitHub token'
    )
  })
})
