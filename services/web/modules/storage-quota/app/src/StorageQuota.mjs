import Settings from '@overleaf/settings'
import { promiseMapWithLimit } from '@overleaf/promise-utils'
import {
  db,
  ObjectId,
  getCollectionInternal,
} from '../../../../app/src/infrastructure/mongodb.mjs'
import RedisWrapper from '../../../../app/src/infrastructure/RedisWrapper.mjs'
import HistoryManager from '../../../../app/src/Features/History/HistoryManager.mjs'

const MB = 1024 * 1024

// Usage is expensive to work out, so it is cached for a few minutes, and
// uploads that get through are added to the cached figure straight away.
const USAGE_CACHE_SECONDS = 5 * 60

let rclient
function getClient() {
  if (!rclient) {
    rclient = RedisWrapper.client('storageQuota')
  }
  return rclient
}

const usageKey = userId => `storage-usage:${userId}`

function enabled() {
  return Settings.storageQuota?.defaultMB > 0
}

// Per-user quotas set by admins (scripts/set_storage_quota.mjs) live in their
// own collection, so the user model is left alone.
async function getQuotaOverrides() {
  return await getCollectionInternal('storageQuotas')
}

/**
 * The user's quota in bytes, or null for no limit. An admin-set quota of
 * 0 MB means no limit.
 */
async function getQuotaBytes(userId) {
  const overrides = await getQuotaOverrides()
  const override = await overrides.findOne({ userId: new ObjectId(userId) })
  const quotaMB = override?.quotaMB ?? Settings.storageQuota.defaultMB
  return quotaMB > 0 ? quotaMB * MB : null
}

async function setQuotaMB(userId, quotaMB) {
  const overrides = await getQuotaOverrides()
  if (quotaMB == null) {
    await overrides.deleteOne({ userId: new ObjectId(userId) })
  } else {
    await overrides.updateOne(
      { userId: new ObjectId(userId) },
      { $set: { quotaMB, updatedAt: new Date() } },
      { upsert: true }
    )
  }
}

function collectFileHashes(folder, hashes = []) {
  for (const file of folder?.fileRefs || []) {
    if (file.hash) hashes.push(file.hash)
  }
  for (const child of folder?.folders || []) {
    collectFileHashes(child, hashes)
  }
  return hashes
}

// Bytes used by the current files (not their history) of the given projects
async function getFileBytes(projects) {
  const sizes = await promiseMapWithLimit(5, projects, async project => {
    const historyId = project.overleaf?.history?.id
    const hashes = collectFileHashes(project.rootFolder?.[0])
    if (!historyId || hashes.length === 0) return 0
    const stats = await HistoryManager.promises.getBlobStats(historyId, hashes)
    return stats.totalBytes
  })
  return sizes.reduce((sum, bytes) => sum + bytes, 0)
}

// Bytes used by the current text of the documents in the given projects
async function getDocBytes(projectIds) {
  if (projectIds.length === 0) return 0
  const [result] = await db.docs
    .aggregate([
      { $match: { project_id: { $in: projectIds }, deleted: { $ne: true } } },
      {
        $group: {
          _id: null,
          bytes: {
            $sum: {
              $reduce: {
                input: { $ifNull: ['$lines', []] },
                initialValue: 0,
                in: { $add: ['$$value', { $strLenBytes: '$$this' }, 1] },
              },
            },
          },
        },
      },
    ])
    .toArray()
  return result?.bytes || 0
}

const PROJECT_FIELDS = { _id: 1, rootFolder: 1, 'overleaf.history.id': 1 }

/** Bytes used by one project's current files and documents. */
async function getProjectBytes(projectId) {
  const project = await db.projects.findOne(
    { _id: new ObjectId(projectId) },
    { projection: PROJECT_FIELDS }
  )
  if (!project) return 0
  const [files, docs] = await Promise.all([
    getFileBytes([project]),
    getDocBytes([project._id]),
  ])
  return files + docs
}

/**
 * Bytes used by all projects the user owns, including archived and trashed
 * ones. Deleted projects do not count.
 */
async function computeUsage(userId) {
  const projects = await db.projects
    .find({ owner_ref: new ObjectId(userId) }, { projection: PROJECT_FIELDS })
    .toArray()
  const [files, docs] = await Promise.all([
    getFileBytes(projects),
    getDocBytes(projects.map(project => project._id)),
  ])
  return files + docs
}

async function getUsage(userId, { fresh = false } = {}) {
  const client = getClient()
  if (!fresh) {
    const cached = await client.get(usageKey(userId))
    if (cached != null) return Number(cached)
  }
  const usage = await computeUsage(userId)
  await client.set(usageKey(userId), usage, 'EX', USAGE_CACHE_SECONDS)
  return usage
}

// Only add to a cached figure: creating the key here would leave it without
// an expiry, and a missing figure is computed afresh anyway.
const INCREMENT_IF_CACHED = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  return redis.call('INCRBY', KEYS[1], ARGV[1])
end
return false`

// Count an upload that was allowed, until the cached usage is next refreshed
async function addToUsage(userId, bytes) {
  if (bytes > 0) {
    await getClient().eval(INCREMENT_IF_CACHED, 1, usageKey(userId), bytes)
  }
}

/** @returns {Promise<{usedBytes: number, quotaBytes: number|null}>} */
async function getStatus(userId, options) {
  const [usedBytes, quotaBytes] = await Promise.all([
    getUsage(userId, options),
    getQuotaBytes(userId),
  ])
  return { usedBytes, quotaBytes }
}

export default {
  enabled,
  getStatus,
  getUsage,
  getQuotaBytes,
  setQuotaMB,
  getProjectBytes,
  addToUsage,
  collectFileHashes,
}
