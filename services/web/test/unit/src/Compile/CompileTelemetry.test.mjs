import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompileTelemetry } from '../../../../app/src/Features/Compile/CompileTelemetry.mjs'
import { CompileQueue } from '../../../../app/src/Features/Compile/CompileQueue.mjs'

describe('aggregate compile measurements', () => {
  afterEach(() => vi.useRealTimers())
  it('reconciles a synthetic workload and keeps minute-window histories separate', () => {
    let now = 60 * 60000
    const telemetry = new CompileTelemetry(() => now)
    for (const status of [
      'success',
      'failure',
      'timedout',
      'terminated',
      'unrecognized',
    ])
      telemetry.record(status)
    expect(telemetry.snapshot(5).totals).toEqual({
      success: 1,
      failure: 1,
      timeout: 1,
      stopped: 1,
      other: 1,
    })
    now += 10 * 60000
    telemetry.record('success')
    expect(telemetry.snapshot(5).totals.success).toEqual(1)
    expect(telemetry.snapshot(15).totals.success).toEqual(2)
    now += 61 * 60000
    telemetry.record('success')
    expect(telemetry.snapshot(60).totals).toEqual({
      success: 1,
      failure: 0,
      timeout: 0,
      stopped: 0,
      other: 0,
    })
  })
  it('reports disabled queue counts as unmeasured', () => {
    expect(new CompileQueue({ slots: 0 }).getSummary()).toEqual({
      enabled: false,
      slots: 0,
      running: null,
      queued: null,
      paused: null,
    })
  })
  it('counts active, queued and paused requests without exposing identities', async () => {
    vi.useFakeTimers()
    const queue = new CompileQueue({ slots: 1, turnMs: 1000 })
    const releaseA = await queue.acquire({
      userKey: 'private-user-a',
      projectId: 'private-project-a',
    })
    queue.allowPausing('private-project-a', 'private-user-a', {
      budgetMs: 10000,
      suspend: async () => {},
      resume: async () => {},
    })
    const b = queue.acquire({
      userKey: 'private-user-b',
      projectId: 'private-project-b',
    })
    const c = queue.acquire({
      userKey: 'private-user-c',
      projectId: 'private-project-c',
    })
    await vi.advanceTimersByTimeAsync(1000)
    expect(queue.getSummary()).toEqual({
      enabled: true,
      slots: 1,
      running: 1,
      queued: 1,
      paused: 1,
    })
    expect(JSON.stringify(queue.getSummary())).not.toContain('private')
    const releaseB = await b
    releaseB()
    await vi.advanceTimersByTimeAsync(0)
    releaseA()
    const releaseC = await c
    releaseC()
    expect(queue.getSummary()).toMatchObject({
      running: 0,
      queued: 0,
      paused: 0,
    })
  })
})
