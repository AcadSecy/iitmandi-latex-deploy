import logger from '@overleaf/logger'
import { expressify } from '@overleaf/promise-utils'
import SessionManager from '../../../../app/src/Features/Authentication/SessionManager.mjs'
import Retention from './Retention.mjs'

// Runs before the routes that move a project to and from the trash, and
// always hands over to them: a failure here must not stop the user.
async function noteTrashed(req, res, next) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (userId) {
    try {
      await Retention.recordTrashed(req.params.project_id, userId)
    } catch (err) {
      logger.warn({ err }, 'could not note when a project was trashed')
    }
  }
  next()
}

async function noteRestored(req, res, next) {
  try {
    await Retention.recordRestored(req.params.project_id)
  } catch (err) {
    logger.warn({ err }, 'could not note that a project left the trash')
  }
  next()
}

// Called daily by the retention cron job
async function run(req, res) {
  res.json(await Retention.run())
}

export default {
  noteTrashed: expressify(noteTrashed),
  noteRestored: expressify(noteRestored),
  run: expressify(run),
}
