import logger from '@overleaf/logger'
import Settings from '@overleaf/settings'
import {
  db,
  ObjectId,
  getCollectionInternal,
} from '../../../../app/src/infrastructure/mongodb.mjs'
import ProjectDeleter from '../../../../app/src/Features/Project/ProjectDeleter.mjs'
import { DeletedProjectReasons } from '../../../../app/src/Features/Project/DeletedProjectReasons.mjs'

const DAY_MS = 24 * 60 * 60 * 1000

// Projects deleted in one run, so that a run stays short
const BATCH_SIZE = 200

// When owners moved their projects to the trash. Projects carry no such date,
// so it is kept in a collection of its own.
async function getTrashTimes() {
  return await getCollectionInternal('trashTimes')
}

/** Note that a user moved a project to the trash, if they own it */
async function recordTrashed(projectId, userId) {
  const project = await db.projects.findOne(
    { _id: new ObjectId(projectId) },
    { projection: { owner_ref: 1 } }
  )
  if (!project?.owner_ref?.equals(userId)) return
  const trashTimes = await getTrashTimes()
  await trashTimes.updateOne(
    { projectId: project._id },
    { $setOnInsert: { trashedAt: new Date() } },
    { upsert: true }
  )
}

/** Forget the date when a project comes out of the trash */
async function recordRestored(projectId) {
  const trashTimes = await getTrashTimes()
  await trashTimes.deleteOne({ projectId: new ObjectId(projectId) })
}

// Projects that were in their owner's trash before trash times were kept get
// a date now, so they are deleted a full retention period from now
async function dateUndatedTrash(trashTimes) {
  const trashed = await db.projects
    .find(
      { $expr: { $in: ['$owner_ref', { $ifNull: ['$trashed', []] }] } },
      { projection: { _id: 1 } }
    )
    .toArray()
  let dated = 0
  for (const { _id } of trashed) {
    const { upsertedCount } = await trashTimes.updateOne(
      { projectId: _id },
      { $setOnInsert: { trashedAt: new Date() } },
      { upsert: true }
    )
    dated += upsertedCount
  }
  return dated
}

/**
 * Delete projects that have been in their owner's trash for longer than
 * Settings.retention.trashDays. They are soft-deleted like any project the
 * owner deletes, so admins can still restore them until the deleted-project
 * retention period ends.
 */
async function expireTrashedProjects() {
  const days = Settings.retention?.trashDays
  if (!(days > 0)) return { dated: 0, deleted: 0 }
  const trashTimes = await getTrashTimes()
  const dated = await dateUndatedTrash(trashTimes)
  const due = await trashTimes
    .find({ trashedAt: { $lt: new Date(Date.now() - days * DAY_MS) } })
    .limit(BATCH_SIZE)
    .toArray()
  let deleted = 0
  for (const { projectId } of due) {
    const project = await db.projects.findOne(
      { _id: projectId },
      { projection: { owner_ref: 1, trashed: 1 } }
    )
    const stillTrashed = (project?.trashed || []).some(userId =>
      userId.equals(project.owner_ref)
    )
    if (stillTrashed) {
      try {
        await ProjectDeleter.promises.deleteProject(projectId, {
          deleterUser: { _id: project.owner_ref },
          deletedReason: DeletedProjectReasons.TRASH_RETENTION,
        })
        deleted++
      } catch (err) {
        logger.err({ err, projectId }, 'could not delete trashed project')
        continue
      }
    }
    await trashTimes.deleteOne({ projectId })
  }
  logger.info({ dated, deleted, days }, 'expired trashed projects')
  return { dated, deleted }
}

/**
 * Remove account and project audit log entries (logins, sharing changes and
 * the IP addresses they were made from) older than
 * Settings.retention.auditLogDays.
 */
async function expireAuditLogs() {
  const days = Settings.retention?.auditLogDays
  if (!(days > 0)) return { userEntries: 0, projectEntries: 0 }
  const cutoff = new Date(Date.now() - days * DAY_MS)
  const [userResult, projectResult] = await Promise.all([
    db.userAuditLogEntries.deleteMany({ timestamp: { $lt: cutoff } }),
    db.projectAuditLogEntries.deleteMany({ timestamp: { $lt: cutoff } }),
  ])
  const result = {
    userEntries: userResult.deletedCount,
    projectEntries: projectResult.deletedCount,
  }
  logger.info({ ...result, days }, 'expired audit log entries')
  return result
}

/** Everything the daily retention job does */
async function run() {
  const trash = await expireTrashedProjects()
  const auditLogs = await expireAuditLogs()
  return { trash, auditLogs }
}

export default {
  recordTrashed,
  recordRestored,
  expireTrashedProjects,
  expireAuditLogs,
  run,
}
