import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCapacityCollector,
  createCapacityHandlers,
  createCapacitySources,
} from '../../../app/src/CapacityDashboard.mjs'

describe('existing source reuse', () => {
  it('uses filesystem headroom rather than claiming logical account-quota usage', async () => {
    const statfs = vi
      .fn()
      .mockResolvedValue({ blocks: 1000, bsize: 1, bfree: 200, bavail: 150 })
    const sources = createCapacitySources({
      editorPlaces: { enabled: () => false },
      compileManager: { getCapacitySummary: () => ({}) },
      storageSettings: {
        diskPath: '/private/path',
        diskReservePercent: 10,
        defaultMB: 500,
        maxMB: 5000,
      },
      statfs,
    })
    expect(await sources.storage()).toEqual({
      totalBytes: 1000,
      usedBytes: 800,
      availableBytes: 150,
      reserveBytes: 100,
      headroomBytes: 50,
      quotaBaseMB: 500,
      quotaMaxMB: 5000,
    })
    expect(await sources.editors()).toMatchObject({
      enabled: false,
      holding: null,
      waiting: null,
    })
    expect(statfs).toHaveBeenCalledWith('/private/path')
  })
})

describe('capacity reading collector', () => {
  let now, sources, collector
  beforeEach(() => {
    now = 1000000
    sources = {
      editors: vi
        .fn()
        .mockResolvedValue({
          holding: 3,
          waiting: 2,
          limit: 50,
          baseLimit: 50,
          maxLimit: 200,
          user: 'private-user',
          filename: 'private.tex',
        }),
      compiles: vi
        .fn()
        .mockResolvedValue({
          enabled: true,
          slots: 8,
          running: 2,
          queued: 1,
          paused: 1,
          projectId: 'private-project',
        }),
      storage: vi
        .fn()
        .mockResolvedValue({
          totalBytes: 1000,
          usedBytes: 600,
          availableBytes: 350,
          reserveBytes: 100,
          headroomBytes: 250,
          quotaBaseMB: 500,
          quotaMaxMB: 5000,
          path: '/private/path',
        }),
      trends: vi
        .fn()
        .mockReturnValue({
          totals: { success: 1, failure: 1, timeout: 1, stopped: 0, other: 0 },
        }),
    }
    collector = createCapacityCollector({
      ...sources,
      clock: () => now,
      timeoutMs: 10,
    })
  })
  it('returns only aggregate scalars, timestamps and collection overhead', async () => {
    const snapshot = await collector.snapshot(15)
    expect(snapshot.editors).toMatchObject({
      state: 'fresh',
      measuredAt: now,
      data: { holding: 3, waiting: 2 },
    })
    expect(snapshot.compiles.data).toMatchObject({
      running: 2,
      queued: 1,
      paused: 1,
    })
    expect(snapshot.storage.data.headroomBytes).toEqual(250)
    expect(snapshot.collectionMs).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(snapshot)).not.toContain('private')
    expect(sources.trends).toHaveBeenCalledWith(15)
  })
  it('coalesces concurrent requests and caches source reads across window choices', async () => {
    await Promise.all([
      collector.snapshot(5),
      collector.snapshot(15),
      collector.snapshot(60),
    ])
    await collector.snapshot(5)
    expect(sources.editors).toHaveBeenCalledTimes(1)
    expect(sources.storage).toHaveBeenCalledTimes(1)
  })
  it('keeps a failed reading explicitly stale, with its original timestamp', async () => {
    await collector.snapshot()
    now += 16000
    sources.editors.mockRejectedValue(new Error('sensitive source diagnostics'))
    const snapshot = await collector.snapshot()
    expect(snapshot.editors.state).toEqual('stale')
    expect(snapshot.editors.measuredAt).toEqual(now - 16000)
    expect(snapshot.editors.data.holding).toEqual(3)
    expect(snapshot.compiles.state).toEqual('fresh')
    expect(JSON.stringify(snapshot)).not.toContain('sensitive')
  })
  it('marks a missing or malformed measurement unavailable, never a healthy zero', async () => {
    sources.editors.mockRejectedValue(new Error('offline'))
    sources.storage.mockResolvedValue({ totalBytes: NaN })
    const snapshot = await collector.snapshot()
    expect(snapshot.editors).toMatchObject({
      state: 'unavailable',
      measuredAt: null,
      data: null,
    })
    expect(snapshot.storage.state).toEqual('unavailable')
  })
  it('times out a hanging source without starting duplicate background reads', async () => {
    let resolve
    sources.editors.mockReturnValue(
      new Promise(done => {
        resolve = done
      })
    )
    const first = await collector.snapshot()
    expect(first.editors.state).toEqual('unavailable')
    now += 16000
    await collector.snapshot()
    expect(sources.editors).toHaveBeenCalledTimes(1)
    resolve({
      enabled: true,
      holding: 1,
      waiting: 0,
      limit: 50,
      baseLimit: 50,
      maxLimit: 200,
    })
    await new Promise(done => setImmediate(done))
    expect((await collector.snapshot()).editors.state).toEqual('fresh')
  })
})

describe('capacity HTML and JSON authorization', () => {
  let handlers, req, res, isAdmin, getSnapshot
  beforeEach(() => {
    isAdmin = vi.fn().mockResolvedValue(false)
    getSnapshot = vi.fn().mockResolvedValue({ aggregate: 'fixture' })
    handlers = createCapacityHandlers({
      getUserId: req => req.userId,
      isAdmin,
      getSnapshot,
      viewPath: 'capacity',
    })
    req = { userId: 'normal-user', query: {} }
    res = {
      set: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      render: vi.fn(),
    }
  })
  it.each(['page', 'json'])(
    'denies a normal account directly at %s',
    async method => {
      await handlers[method](req, res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(getSnapshot).not.toHaveBeenCalled()
      expect(res.render).not.toHaveBeenCalled()
    }
  )
  it('denies logged-out requests before collecting any data', async () => {
    req.userId = null
    await handlers.json(req, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(isAdmin).not.toHaveBeenCalled()
    expect(getSnapshot).not.toHaveBeenCalled()
  })
  it('checks the current server-side role and applies a valid window', async () => {
    isAdmin.mockResolvedValue(true)
    req.query.window = '60'
    await handlers.json(req, res)
    expect(isAdmin).toHaveBeenCalledWith('normal-user')
    expect(getSnapshot).toHaveBeenCalledWith(60)
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store')
    expect(res.json).toHaveBeenCalledWith({ aggregate: 'fixture' })
  })
  it.each(['0', '10000', ['5', '60'], 'bad'])(
    'rejects invalid aggregation input %s',
    async window => {
      isAdmin.mockResolvedValue(true)
      req.query.window = window
      await handlers.page(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(getSnapshot).not.toHaveBeenCalled()
    }
  )
})
