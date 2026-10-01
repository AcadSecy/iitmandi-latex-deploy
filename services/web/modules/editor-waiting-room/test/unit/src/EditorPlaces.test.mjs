import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import * as path from 'node:path'

const modulePath = path.join(
  import.meta.dirname,
  '../../../app/src/EditorPlaces.mjs'
)

const GB = 1024 * 1024 * 1024

describe('EditorPlaces.currentLimit', function () {
  beforeEach(async function (ctx) {
    ctx.Settings = { editorPlaces: { limit: 50, maxLimit: 200 } }
    vi.doMock('@overleaf/settings', () => ({ default: ctx.Settings }))
    vi.doMock('../../../../../app/src/infrastructure/RedisWrapper.mjs', () => ({
      default: { client: () => ({}) },
    }))
    ctx.spies = [
      vi.spyOn(os, 'availableParallelism').mockReturnValue(16),
      (ctx.loadavg = vi.spyOn(os, 'loadavg').mockReturnValue([4, 4, 4])),
      (ctx.freemem = vi.spyOn(os, 'freemem').mockReturnValue(16 * GB)),
      vi.spyOn(os, 'totalmem').mockReturnValue(32 * GB),
    ]
    ctx.EditorPlaces = (await import(modulePath)).default
  })

  afterEach(function (ctx) {
    for (const spy of ctx.spies) spy.mockRestore()
  })

  it('lets up to the maximum in while the server has room', function (ctx) {
    expect(ctx.EditorPlaces.currentLimit()).to.equal(200)
  })

  it('keeps to the limit while the CPUs are busy', function (ctx) {
    ctx.loadavg.mockReturnValue([14, 10, 8])
    expect(ctx.EditorPlaces.currentLimit()).to.equal(50)
  })

  it('keeps to the limit when memory runs low', function (ctx) {
    ctx.freemem.mockReturnValue(2 * GB)
    expect(ctx.EditorPlaces.currentLimit()).to.equal(50)
  })

  it('keeps to the limit when no maximum is set', function (ctx) {
    ctx.Settings.editorPlaces.maxLimit = 0
    expect(ctx.EditorPlaces.currentLimit()).to.equal(50)
  })
})
