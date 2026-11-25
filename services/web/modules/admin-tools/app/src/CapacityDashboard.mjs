import { performance } from 'node:perf_hooks'

const FIELDS = {
  editors: ['holding', 'waiting', 'limit', 'baseLimit', 'maxLimit'],
  compiles: ['slots', 'running', 'queued', 'paused'],
  storage: [
    'totalBytes',
    'usedBytes',
    'availableBytes',
    'reserveBytes',
    'headroomBytes',
    'quotaBaseMB',
    'quotaMaxMB',
  ],
}

export function createCapacitySources({
  editorPlaces,
  compileManager,
  storageSettings,
  statfs,
}) {
  return {
    editors: async () =>
      editorPlaces.enabled()
        ? { enabled: true, ...(await editorPlaces.stats()) }
        : {
            enabled: false,
            holding: null,
            waiting: null,
            limit: 0,
            baseLimit: 0,
            maxLimit: 0,
          },
    compiles: () => compileManager.getCapacitySummary(),
    storage: async () => {
      const reservePercent = storageSettings.diskReservePercent
      if (
        !Number.isFinite(reservePercent) ||
        reservePercent < 0 ||
        reservePercent > 100
      )
        throw new Error('Invalid reserve configuration')
      const stats = await statfs(storageSettings.diskPath)
      const totalBytes = stats.blocks * stats.bsize
      const availableBytes = stats.bavail * stats.bsize
      const reserveBytes = Math.ceil((totalBytes * reservePercent) / 100)
      return {
        totalBytes,
        usedBytes: (stats.blocks - stats.bfree) * stats.bsize,
        availableBytes,
        reserveBytes,
        headroomBytes: Math.max(0, availableBytes - reserveBytes),
        quotaBaseMB: Math.max(0, storageSettings.defaultMB),
        quotaMaxMB: Math.max(
          0,
          storageSettings.defaultMB,
          storageSettings.maxMB
        ),
      }
    },
  }
}

// Scalar allowlist is also a privacy boundary: source diagnostics, identifiers,
// credentials, filenames and request bodies cannot enter the response.
function safeData(name, value) {
  const data = {}
  for (const key of FIELDS[name]) {
    const number = value[key]
    if (number !== null && (!Number.isSafeInteger(number) || number < 0))
      throw new Error('Invalid measurement')
    data[key] = number
  }
  if (name !== 'storage') data.enabled = value.enabled !== false
  return data
}

export function createCapacityCollector({
  editors,
  compiles,
  storage,
  trends,
  clock = Date.now,
  cacheMs = 15000,
  timeoutMs = 1500,
}) {
  const sources = { editors, compiles, storage }
  const states = Object.fromEntries(
    Object.keys(sources).map(name => [
      name,
      { attemptedAt: -Infinity, sample: null, failed: false, pending: null },
    ])
  )
  async function read(name) {
    const state = states[name]
    if (!state.pending && clock() - state.attemptedAt >= cacheMs) {
      state.attemptedAt = clock()
      const started = performance.now()
      state.pending = Promise.resolve()
        .then(sources[name])
        .then(value => {
          state.sample = {
            data: safeData(name, value),
            measuredAt: clock(),
            durationMs: performance.now() - started,
          }
          state.failed = false
        })
        .catch(() => {
          state.failed = true
        })
        .finally(() => {
          state.pending = null
        })
    }
    if (state.pending) {
      let timer
      await Promise.race([
        state.pending,
        new Promise(resolve => {
          timer = setTimeout(() => {
            state.failed = true
            resolve()
          }, timeoutMs)
        }),
      ])
      clearTimeout(timer)
    }
    const sample = state.sample
    return {
      state: !sample
        ? 'unavailable'
        : state.failed || clock() - sample.measuredAt > cacheMs * 2
          ? 'stale'
          : 'fresh',
      measuredAt: sample?.measuredAt ?? null,
      durationMs: sample?.durationMs ?? null,
      data: sample?.data ?? null,
    }
  }
  return {
    async snapshot(minutes = 15) {
      const started = performance.now()
      const [editors, compiles, storage] = await Promise.all(
        Object.keys(sources).map(read)
      )
      return {
        sampledAt: clock(),
        cacheSeconds: cacheMs / 1000,
        collectionMs: performance.now() - started,
        editors,
        compiles,
        storage,
        trends: trends(minutes),
      }
    },
  }
}

// Shared by the HTML and JSON endpoints; authorization is server-side even for
// a direct request that never visits the dashboard page.
export function createCapacityHandlers({
  getUserId,
  isAdmin,
  getSnapshot,
  viewPath,
}) {
  async function read(req, res, page) {
    res.set('Cache-Control', 'private, no-store')
    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ code: 'login_required' })
    if (!(await isAdmin(userId)))
      return res.status(403).json({ code: 'admin_required' })
    const requested = req.query?.window ?? '15'
    if (!['5', '15', '60'].includes(requested))
      return res.status(400).json({ code: 'invalid_window' })
    const snapshot = await getSnapshot(Number(requested))
    return page
      ? res.render(viewPath, {
          title: 'capacity_and_usage',
          snapshot,
          windowMinutes: Number(requested),
        })
      : res.json(snapshot)
  }
  return {
    page: (req, res) => read(req, res, true),
    json: (req, res) => read(req, res, false),
  }
}
