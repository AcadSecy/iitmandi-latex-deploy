import logger from '@overleaf/logger'
import OError from '@overleaf/o-error'
import Mongo from '../../../../app/src/Features/Helpers/Mongo.mjs'
import { GitHubSyncUserCredentials } from '../models/githubSyncUserCredentials.mjs'
import { AccessTokenEncryptor } from './AccessTokenEncryptorHelper.mjs'
import GitHubApiClient from './GitHubApiClient.mjs'
import { InvalidTokenError } from './GitSyncErrors.mjs'

const { normalizeQuery } = Mongo

async function encryptAccessToken(accessToken) {
  try {
    return await AccessTokenEncryptor.encryptJson(accessToken)
  } catch (err) {
    throw OError.tag('failed to encrypt token', err)
  }
}

async function decryptAccessToken(tokenEncrypted) {
  try {
    return await AccessTokenEncryptor.decryptToJson(tokenEncrypted)
  } catch (err) {
    throw new InvalidTokenError('failed to decrypt token', { status: 401 }, err)
  }
}

// ------------------------- exports -------------------------- //
async function getUserToken(userId) {
  const credentials = await GitHubSyncUserCredentials.findOne(normalizeQuery({ userId }))
  if (!credentials) throw new InvalidTokenError('no user token', { userId, status: 400 })
  return await decryptAccessToken(credentials.github)
}

async function saveUserToken(userId, accessToken) {
  const tokenEncrypted = await encryptAccessToken(accessToken)
  await GitHubSyncUserCredentials.findOneAndUpdate(
    normalizeQuery({ userId }),
    { $set: { github: tokenEncrypted } },
    { upsert: true }
  )
}

// Remove exactly the credential we revoke, even if the user reconnects concurrently.
async function removeUserToken(userId) {
  const credentials = await GitHubSyncUserCredentials.findOneAndDelete(
    normalizeQuery({ userId })
  )
  if (!credentials) return

  let token
  try {
    token = await decryptAccessToken(credentials.github)
  } catch {
    logger.warn({ userId }, 'failed to decrypt removed GitHub token')
    return
  }

  // The local disconnect succeeds even when GitHub is unavailable.
  GitHubApiClient.revokeToken(token).catch(() => {
    logger.warn({ userId }, 'failed to revoke removed GitHub token')
  })
}

export default {
  saveUserToken,
  getUserToken,
  removeUserToken
}
