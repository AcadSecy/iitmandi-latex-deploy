import logger from '@overleaf/logger'
import { expressify } from '@overleaf/promise-utils'
import SessionManager from '../../../../app/src/Features/Authentication/SessionManager.mjs'
import ProjectGetter from '../../../../app/src/Features/Project/ProjectGetter.mjs'
import StorageQuota from './StorageQuota.mjs'

/**
 * Whether adding `incomingBytes` would take the user past what they may use
 * right now (see StorageQuota.getStatus). When the size is not known up front
 * (0), refuse only once the user is at the limit. Allowed uploads are added to
 * the cached usage. If usage cannot be worked out, the upload is allowed
 * rather than blocked.
 */
async function wouldExceed(userId, incomingBytes) {
  try {
    const { usedBytes, limitBytes } = await StorageQuota.getStatus(userId)
    const exceeded =
      limitBytes != null &&
      (incomingBytes > 0
        ? usedBytes + incomingBytes > limitBytes
        : usedBytes >= limitBytes)
    if (!exceeded) {
      await StorageQuota.addToUsage(userId, incomingBytes)
    }
    return exceeded
  } catch (err) {
    logger.err({ err, userId }, 'could not check storage quota, allowing it')
    return false
  }
}

// Close to the size of an upload, available before the body is read
function contentLength(req) {
  return Number(req.headers['content-length']) || 0
}

async function getOwnerId(projectId) {
  const project = await ProjectGetter.promises.getProject(projectId, {
    owner_ref: 1,
  })
  return project?.owner_ref?.toString()
}

function quotaExceededText(req) {
  return req.i18n.translate('storage_quota_exceeded')
}

// Uploads into a project count against the project owner's quota. The file
// tree uploader maps this error code to a message.
async function checkFileUpload(req, res, next) {
  if (!StorageQuota.enabled()) return next()
  const ownerId = await getOwnerId(req.params.Project_id)
  if (!ownerId || !(await wouldExceed(ownerId, contentLength(req)))) {
    return next()
  }
  res.status(422).json({ success: false, error: 'storage-quota-exceeded' })
}

// A new project uploaded as a zip file
async function checkProjectUpload(req, res, next) {
  if (!StorageQuota.enabled()) return next()
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (!userId || !(await wouldExceed(userId, contentLength(req)))) {
    return next()
  }
  res.status(422).json({ success: false, error: quotaExceededText(req) })
}

// A copy of a project counts against the quota of the user who makes it
async function checkClone(req, res, next) {
  if (!StorageQuota.enabled()) return next()
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (!userId) return next()
  let projectBytes
  try {
    projectBytes = await StorageQuota.getProjectBytes(req.params.Project_id)
  } catch (err) {
    logger.err({ err }, 'could not size project for storage quota')
    return next()
  }
  if (!(await wouldExceed(userId, projectBytes))) return next()
  // The clone dialog shows the message of a 400 response
  res.status(400).json({ message: quotaExceededText(req) })
}

// Linked files: the size is only known after fetching, so refuse only when
// the owner is already at their quota
async function checkLinkedFile(req, res, next) {
  if (!StorageQuota.enabled()) return next()
  const ownerId = await getOwnerId(req.params.project_id)
  if (!ownerId || !(await wouldExceed(ownerId, 0))) return next()
  res.status(400).json({ message: quotaExceededText(req) })
}

// For the account settings page (?fresh=true, the figure as of now) and the
// project list (the cached figure, which is cheaper)
async function getUserStorage(req, res) {
  if (!StorageQuota.enabled()) {
    return res.json({ enabled: false })
  }
  const userId = SessionManager.getLoggedInUserId(req.session)
  const status = await StorageQuota.getStatus(userId, {
    fresh: req.query.fresh === 'true',
  })
  res.json({ enabled: true, ...status })
}

// The size of each project the user owns, largest first
async function getUserProjectSizes(req, res) {
  if (!StorageQuota.enabled()) {
    return res.json({ projects: [] })
  }
  const userId = SessionManager.getLoggedInUserId(req.session)
  const projects = await StorageQuota.getProjectSizes(userId)
  res.json({ projects })
}

export default {
  checkFileUpload: expressify(checkFileUpload),
  checkProjectUpload: expressify(checkProjectUpload),
  checkClone: expressify(checkClone),
  checkLinkedFile: expressify(checkLinkedFile),
  getUserStorage: expressify(getUserStorage),
  getUserProjectSizes: expressify(getUserProjectSizes),
}
