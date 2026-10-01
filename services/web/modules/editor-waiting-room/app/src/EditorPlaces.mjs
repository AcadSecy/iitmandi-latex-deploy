import fs from 'node:fs'
import Settings from '@overleaf/settings'
import RedisWrapper from '../../../../app/src/infrastructure/RedisWrapper.mjs'

// A place is kept for this long without being renewed. The editor renews it
// every minute while the user is active.
const HOLD_MS = 150 * 1000

// Someone in the queue keeps their turn for this long without checking in.
// The waiting page checks every 10 seconds, but browsers may slow background
// tabs down to once a minute.
const GIVE_UP_MS = 3 * 60 * 1000

const KEYS = [
  'editor-places:holders',
  'editor-places:waiting',
  'editor-places:last-asked',
]

const ACQUIRE_SCRIPT = fs.readFileSync(
  new URL('./acquire-place.lua', import.meta.url),
  'utf8'
)

let rclient
function getClient() {
  if (!rclient) {
    rclient = RedisWrapper.client('editorPlaces')
    rclient.defineCommand('acquireEditorPlace', {
      numberOfKeys: KEYS.length,
      lua: ACQUIRE_SCRIPT,
    })
  }
  return rclient
}

function enabled() {
  return Settings.editorPlaces?.limit > 0
}

/**
 * Give the user a place in the editor (or renew the one they hold), or put
 * them in the queue.
 *
 * @param {string} userId
 * @returns {Promise<{admitted: boolean, position: number}>} position is the
 *   user's place in the queue when not admitted
 */
async function acquire(userId) {
  const [admitted, position] = await getClient().acquireEditorPlace(
    ...KEYS,
    String(userId),
    Date.now(),
    HOLD_MS,
    Settings.editorPlaces.limit,
    GIVE_UP_MS
  )
  return { admitted: admitted === 1, position }
}

async function stats() {
  const client = getClient()
  const [holding, waiting] = await Promise.all([
    client.zcount(KEYS[0], Date.now(), '+inf'),
    client.zcard(KEYS[1]),
  ])
  return { limit: Settings.editorPlaces.limit, holding, waiting }
}

export default { enabled, acquire, stats, ACQUIRE_SCRIPT, KEYS }
