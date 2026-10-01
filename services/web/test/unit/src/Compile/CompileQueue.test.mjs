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

// Returns the reason a promise rejects with. (The unit test bootstrap loads
// chai-as-promised, which replaces vitest's `expect(promise).rejects`.)
async function rejectionOf(promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the promise to reject')
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
    const error = await rejectionOf(b)
    expect(error).toBeInstanceOf(CompileQueueError)
    expect(error.reason).toBe('cancelled')
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
    const error = await rejectionOf(b)
    expect(error).toBeInstanceOf(CompileQueueError)
    expect(error.reason).toBe('aborted')
    expect(queue.getStatus('p2', 'b').state).toBe('idle')
  })

  it('rejects an already-aborted signal without queueing', async function () {
    const queue = new CompileQueue({ slots: 1 })
    const controller = new AbortController()
    controller.abort()
    const error = await rejectionOf(
      queue.acquire({ userKey: 'a', projectId: 'p1', signal: controller.signal })
    )
    expect(error.reason).toBe('aborted')
    expect(queue.getStatus('p1', 'a').waiting).toBe(0)
  })

  it('gives up after the maximum wait', async function () {
    vi.useFakeTimers()
    const queue = new CompileQueue({ slots: 1, maxWaitMs: 1000 })
    track(queue, { userKey: 'a', projectId: 'p1' }, started)
    const b = track(queue, { userKey: 'b', projectId: 'p2' }, started)
    vi.advanceTimersByTime(1000)
    expect((await rejectionOf(b)).reason).toBe('timeout')
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

  describe('taking turns', function () {
    function pauseHandlers(budgetMs = 60_000) {
      return {
        budgetMs,
        suspend: vi.fn().mockResolvedValue(),
        resume: vi.fn().mockResolvedValue(),
      }
    }

    it('pauses a compile after its turn while someone waits, and resumes it later', async function () {
      vi.useFakeTimers()
      const queue = new CompileQueue({ slots: 1, turnMs: 1000 })
      const releaseA = await queue.acquire({ userKey: 'a', projectId: 'p1' })
      const handlers = pauseHandlers()
      queue.allowPausing('p1', 'a', handlers)
      const b = track(queue, { userKey: 'b', projectId: 'p2' }, started)

      await vi.advanceTimersByTimeAsync(999)
      expect(handlers.suspend).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(handlers.suspend).toHaveBeenCalledOnce()
      expect(started).toEqual(['b/p2'])
      expect(queue.getStatus('p1', 'a')).toMatchObject({
        state: 'waiting',
        paused: true,
        position: 1,
      })
      expect(queue.hasPaused('p1', 'a')).toBe(true)

      const releaseB = await b
      releaseB()
      await vi.advanceTimersByTimeAsync(0)
      expect(handlers.resume).toHaveBeenCalledOnce()
      expect(queue.getStatus('p1', 'a').state).toBe('running')

      expect(queue.hasPaused('p1', 'a')).toBe(false)
      releaseA()
      expect(queue.getStatus('p1', 'a').state).toBe('idle')
    })

    it('lets a compile run on while nobody waits', async function () {
      vi.useFakeTimers()
      const queue = new CompileQueue({ slots: 1, turnMs: 1000 })
      await queue.acquire({ userKey: 'a', projectId: 'p1' })
      const handlers = pauseHandlers()
      queue.allowPausing('p1', 'a', handlers)
      await vi.advanceTimersByTimeAsync(5000)
      expect(handlers.suspend).not.toHaveBeenCalled()

      // someone arrives after the turn is over
      track(queue, { userKey: 'b', projectId: 'p2' }, started)
      await vi.advanceTimersByTimeAsync(0)
      expect(handlers.suspend).toHaveBeenCalledOnce()
      expect(started).toEqual(['b/p2'])
    })

    it('never pauses compiles when turns are off', async function () {
      vi.useFakeTimers()
      const queue = new CompileQueue({ slots: 1 })
      await queue.acquire({ userKey: 'a', projectId: 'p1' })
      const handlers = pauseHandlers()
      queue.allowPausing('p1', 'a', handlers)
      track(queue, { userKey: 'b', projectId: 'p2' }, started)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(handlers.suspend).not.toHaveBeenCalled()
      expect(queue.getStatus('p2', 'b').state).toBe('waiting')
    })

    it('lets a compile run on when it cannot be paused', async function () {
      vi.useFakeTimers()
      const queue = new CompileQueue({ slots: 1, turnMs: 1000 })
      await queue.acquire({ userKey: 'a', projectId: 'p1' })
      const handlers = pauseHandlers()
      handlers.suspend.mockRejectedValue(new Error('not running'))
      queue.allowPausing('p1', 'a', handlers)
      track(queue, { userKey: 'b', projectId: 'p2' }, started)
      await vi.advanceTimersByTimeAsync(5000)
      expect(handlers.suspend).toHaveBeenCalledOnce()
      expect(queue.getStatus('p1', 'a').state).toBe('running')
      expect(started).toEqual([])
    })

    it('does not pause a compile that could then miss its deadline', async function () {
      vi.useFakeTimers()
      const queue = new CompileQueue({
        slots: 1,
        turnMs: 1000,
        maxRequestMs: 4000,
      })
      await queue.acquire({ userKey: 'a', projectId: 'p1' })
      const handlers = pauseHandlers(3000)
      queue.allowPausing('p1', 'a', handlers)
      track(queue, { userKey: 'b', projectId: 'p2' }, started)
      await vi.advanceTimersByTimeAsync(3000)
      expect(handlers.suspend).not.toHaveBeenCalled()
    })

    it('resumes a paused compile first when it would otherwise miss its deadline', async function () {
      vi.useFakeTimers()
      const queue = new CompileQueue({
        slots: 1,
        turnMs: 1000,
        maxRequestMs: 10_000,
      })
      await queue.acquire({ userKey: 'a', projectId: 'p1' })
      const handlers = pauseHandlers(3000)
      queue.allowPausing('p1', 'a', handlers)
      const b = track(queue, { userKey: 'b', projectId: 'p2' }, started)
      track(queue, { userKey: 'c', projectId: 'p3' }, started)

      await vi.advanceTimersByTimeAsync(1000)
      expect(handlers.suspend).toHaveBeenCalledOnce()
      expect(queue.getStatus('p1', 'a').position).toBe(2)

      // a needs 2 s more and the request ends at 10 s: from 7 s it goes first
      await vi.advanceTimersByTimeAsync(6000)
      expect(queue.getStatus('p1', 'a').position).toBe(1)
      const releaseB = await b
      releaseB()
      await vi.advanceTimersByTimeAsync(0)
      expect(handlers.resume).toHaveBeenCalledOnce()
      expect(started).toEqual(['b/p2'])
    })

    it('pauses at most maxPaused compiles', async function () {
      vi.useFakeTimers()
      const queue = new CompileQueue({ slots: 2, turnMs: 1000, maxPaused: 1 })
      await queue.acquire({ userKey: 'a', projectId: 'p1' })
      await queue.acquire({ userKey: 'b', projectId: 'p2' })
      const handlersA = pauseHandlers()
      const handlersB = pauseHandlers()
      queue.allowPausing('p1', 'a', handlersA)
      queue.allowPausing('p2', 'b', handlersB)
      track(queue, { userKey: 'c', projectId: 'p3' }, started)
      track(queue, { userKey: 'd', projectId: 'p4' }, started)
      await vi.advanceTimersByTimeAsync(1000)
      expect(
        handlersA.suspend.mock.calls.length +
          handlersB.suspend.mock.calls.length
      ).toBe(1)
      expect(started).toEqual(['c/p3'])
    })

    it('keeps a paused compile when its user cancels other requests', async function () {
      vi.useFakeTimers()
      const queue = new CompileQueue({ slots: 1, turnMs: 1000 })
      await queue.acquire({ userKey: 'a', projectId: 'p1' })
      queue.allowPausing('p1', 'a', pauseHandlers())
      track(queue, { userKey: 'b', projectId: 'p2' }, started)
      await vi.advanceTimersByTimeAsync(1000)
      expect(queue.getStatus('p1', 'a').paused).toBe(true)

      expect(queue.cancel('p1', 'a')).toBe(false)
      expect(queue.hasPaused('p1', 'a')).toBe(true)
    })

    it('does not start a second compile of a user whose compile is paused', async function () {
      vi.useFakeTimers()
      const queue = new CompileQueue({ slots: 2, turnMs: 1000 })
      await queue.acquire({ userKey: 'a', projectId: 'p1' })
      const releaseB = await queue.acquire({ userKey: 'b', projectId: 'p2' })
      queue.allowPausing('p1', 'a', pauseHandlers())
      track(queue, { userKey: 'a', projectId: 'p3' }, started)
      track(queue, { userKey: 'c', projectId: 'p4' }, started)
      await vi.advanceTimersByTimeAsync(1000)
      expect(started).toEqual(['c/p4'])
      releaseB()
      await vi.advanceTimersByTimeAsync(0)
      // the free slot resumes the paused compile, not the second request
      expect(queue.getStatus('p1', 'a').state).toBe('running')
      expect(queue.getStatus('p3', 'a').state).toBe('waiting')
    })
  })
})
