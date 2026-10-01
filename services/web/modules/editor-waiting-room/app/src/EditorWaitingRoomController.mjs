import Path from 'node:path'
import logger from '@overleaf/logger'
import Settings from '@overleaf/settings'
import { expressify } from '@overleaf/promise-utils'
import SessionManager from '../../../../app/src/Features/Authentication/SessionManager.mjs'
import AdminAuthorizationHelper from '../../../../app/src/Features/Helpers/AdminAuthorizationHelper.mjs'
import EditorPlaces from './EditorPlaces.mjs'

const HEARTBEAT_SECONDS = 60

// The limit does not apply when it is switched off, to admins, or to people
// who are not logged in (anonymous link sharing).
function isExempt(req) {
  if (!EditorPlaces.enabled()) return true
  const user = SessionManager.getSessionUser(req.session)
  return !user || AdminAuthorizationHelper.hasAdminAccess(user)
}

// If Redis cannot be reached, let people in rather than lock everyone out.
async function tryAcquire(req) {
  try {
    return await EditorPlaces.acquire(
      SessionManager.getLoggedInUserId(req.session)
    )
  } catch (err) {
    logger.err({ err }, 'could not check editor places, letting the user in')
    return null
  }
}

// Runs before the editor page is rendered: shows the waiting room instead
// when every place is taken.
async function openEditor(req, res, next) {
  if (isExempt(req)) return next()
  const place = await tryAcquire(req)
  if (!place || place.admitted) return next()
  res.render(Path.resolve(import.meta.dirname, '../views/waiting-room'), {
    title: 'editor_waiting_room_title',
    position: place.position,
    limit: EditorPlaces.currentLimit(),
  })
}

// Called by the waiting room to ask for a place, and by the editor to renew
// it while the user is active.
async function checkPlace(req, res) {
  if (isExempt(req)) {
    return res.json({ enabled: false, admitted: true })
  }
  const place = await tryAcquire(req)
  res.json({
    enabled: true,
    admitted: !place || place.admitted,
    position: place?.position ?? 0,
    heartbeatSeconds: HEARTBEAT_SECONDS,
    idleMinutes: Settings.editorPlaces.idleMinutes,
  })
}

async function getStats(req, res) {
  if (!EditorPlaces.enabled()) {
    return res.json({ limit: 0, holding: null, waiting: null })
  }
  res.json(await EditorPlaces.stats())
}

export default {
  openEditor: expressify(openEditor),
  checkPlace: expressify(checkPlace),
  getStats: expressify(getStats),
}
