import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CompileQueue,
  CompileQueueError,
} from '../../../../app/src/Features/Compile/CompileQueue.mjs'

// Collects the order in which queued requests are given a slot.
function track(queue, request, started) {
  const promise = queue.acquire(request).then(release => {
    started.push(`${request.userKey}/${request.projectId}`)
    return release
  })
  promise.catch(() => {})
  return promise
}

async function flush() {
  await new Promise(resolve => setImmediate(resolve))
}

describe('CompileQueue', function () {
  let started

  beforeEach(function () {
    started = []
  })

  afterEach(function () {
    vi.useRealTimers()
  })

  it('lets every compile through when disabled', async function () {
    const queue = new CompileQueue({ slots: 0 })
    expect(queue.enabled).toBe(false)
    for (let i = 0; i < 5; i++) {
      track(queue, { userKey: `u${i}`, projectId: 'p' }, started)
    }
    await flush()
    expect(started).toHaveLength(5)
  })

  it('runs at most `slots` compiles and starts the next when one is released', async function () {
    const queue = new CompileQueue({ slots: 2 })
    const a = track(queue, { userKey: 'a', projectId: 'p1' }, started)
    track(queue, { userKey: 'b', projectId: 'p2' }, started)
    track(queue, { userKey: 'c', projectId: 'p3' }, started)
    await flush()
    expect(started).toEqual(['a/p1', 'b/p2'])
    expect(queue.getStatus('p3', 'c')).toMatchObject({
      state: 'waiting',
      position: 1,
      running: 2,
      waiting: 1,
    })

    const releaseA = await a
    releaseA()
    await flush()
    expect(started).toEqual(['a/p1', 'b/p2', 'c/p3'])
    expect(queue.getStatus('p3', 'c').state).toBe('running')
  })

  it('ignores a second release call', async function () {
    const queue = new CompileQueue({ slots: 1 })
    const a = track(queue, { userKey: 'a', projectId: 'p1' }, started)
    track(queue, { userKey: 'b', projectId: 'p2' }, started)
    track(queue, { userKey: 'c', projectId: 'p3' }, started)
    const releaseA = await a
    releaseA()
    releaseA()
    await flush()
    expect(started).toEqual(['a/p1', 'b/p2'])
  })

  it('runs one compile per user and keeps their place in line', async function () {
    const queue = new CompileQueue({ slots: 2 })
    const a1 = track(queue, { userKey: 'a', projectId: 'p1' }, started)
    track(queue, { userKey: 'a', projectId: 'p2' }, started)
    track(queue, { userKey: 'b', projectId: 'p3' }, started)
    await flush()
    // b skips past a's second compile because a is already compiling
    expect(started).toEqual(['a/p1', 'b/p3'])
    expect(queue.getStatus('p2', 'a')).toMatchObject({
      state: 'waiting',
      position: 1,
    })

    const releaseA1 = await a1
    releaseA1()
    await flush()
    expect(started).toEqual(['a/p1', 'b/p3', 'a/p2'])
  })

  it('serves requested compiles before auto-compiles', async function () {
    const queue = new CompileQueue({ slots: 1 })
    const first = track(queue, { userKey: 'x', projectId: 'p0' }, started)
    track(
      queue,
      { userKey: 'auto', projectId: 'p1', isAutoCompile: true },
      started
    )
    track(queue, { userKey: 'manual', projectId: 'p2' }, started)
    await flush()
    expect(queue.getStatus('p2', 'manual').position).toBe(1)
    expect(queue.getStatus('p1', 'auto')).toMatchObject({
      position: 2,
      isAutoCompile: true,
    })

    const release = await first
    release()
    await flush()
    expect(started).toEqual(['x/p0', 'manual/p2'])
  })

  it('promotes a waiting auto-compile without losing its arrival time', async function () {
    const queue = new CompileQueue({ slots: 1 })
    const first = track(queue, { userKey: 'x', projectId: 'p0' }, started)
    track(
      queue,
      { userKey: 'auto', projectId: 'p1', isAutoCompile: true },
      started
    )
    track(queue, { userKey: 'manual', projectId: 'p2' }, started)
    await flush()

    expect(queue.promote('p1', 'auto')).toBe(true)
    expect(queue.promote('p1', 'auto')).toBe(false)
    expect(queue.getStatus('p1', 'auto')).toMatchObject({
      position: 1,
      isAutoCompile: false,
    })

    const release = await first
    release()
    await flush()
    expect(started).toEqual(['x/p0', 'auto/p1'])
  })

  it('rejects a cancelled request and leaves running compiles alone', async function () {
    const queue = new CompileQueue({ slots: 1 })
    track(queue, { userKey: 'a', projectId: 'p1' }, started)
    const b = track(queue, { userKey: 'b', projectId: 'p2' }, started)
    await flush()

    expect(queue.cancel('p1', 'a')).toBe(false)
    expect(queue.cancel('p2', 'b')).toBe(true)
    await expect(b).rejects.toMatchObject({ reason: 'cancelled' })
    expect(queue.getStatus('p2', 'b').state).toBe('idle')
    expect(queue.getStatus('p1', 'a').state).toBe('running')
  })

  it('rejects a request whose signal aborts while waiting', async function () {
    const queue = new CompileQueue({ slots: 1 })
    track(queue, { userKey: 'a', projectId: 'p1' }, started)
    const controller = new AbortController()
    const b = track(
      queue,
      { userKey: 'b', projectId: 'p2', signal: controller.signal },
      started
    )
    await flush()
    controller.abort()
    await expect(b).rejects.toBeInstanceOf(CompileQueueError)
    await expect(b).rejects.toMatchObject({ reason: 'aborted' })
    expect(queue.getStatus('p2', 'b').state).toBe('idle')
  })

  it('rejects an already-aborted signal without queueing', async function () {
    const queue = new CompileQueue({ slots: 1 })
    const controller = new AbortController()
    controller.abort()
    await expect(
      queue.acquire({ userKey: 'a', projectId: 'p1', signal: controller.signal })
    ).rejects.toMatchObject({ reason: 'aborted' })
    expect(queue.getStatus('p1', 'a').waiting).toBe(0)
  })

  it('gives up after the maximum wait', async function () {
    vi.useFakeTimers()
    const queue = new CompileQueue({ slots: 1, maxWaitMs: 1000 })
    track(queue, { userKey: 'a', projectId: 'p1' }, started)
    const b = track(queue, { userKey: 'b', projectId: 'p2' }, started)
    vi.advanceTimersByTime(1000)
    await expect(b).rejects.toMatchObject({ reason: 'timeout' })
    expect(queue.getStatus('p2', 'b').state).toBe('idle')
  })

  it('does not time out once a request has started', async function () {
    vi.useFakeTimers()
    const queue = new CompileQueue({ slots: 1, maxWaitMs: 1000 })
    const a = queue.acquire({ userKey: 'a', projectId: 'p1' })
    vi.advanceTimersByTime(5000)
    const release = await a
    expect(queue.getStatus('p1', 'a').state).toBe('running')
    release()
    expect(queue.getStatus('p1', 'a').state).toBe('idle')
  })
})
