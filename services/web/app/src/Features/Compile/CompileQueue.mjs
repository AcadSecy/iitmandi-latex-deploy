/**
 * First-come-first-served queue for compile slots.
 *
 * - At most `slots` compiles run at once. Further requests wait for a free
 *   slot instead of failing, so the PDF appears as soon as the server is free.
 * - Each user runs at most one compile at a time. A second request from the
 *   same user keeps its place in the queue until the first one finishes.
 * - Requested compiles are served before auto-compiles, so auto-compiles only
 *   use capacity that nobody is waiting for. A waiting auto-compile can be
 *   promoted when the user asks for a compile.
 *
 * The queue is held in memory. This is correct for Community Edition, where
 * every compile request goes through the single web process.
 */

export class CompileQueueError extends Error {
  /**
   * @param {'timeout' | 'cancelled' | 'aborted'} reason
   */
  constructor(reason) {
    super(`compile queue: ${reason}`)
    this.name = 'CompileQueueError'
    this.reason = reason
  }
}

/**
 * @typedef {Object} CompileQueueStatus
 * @property {'idle' | 'waiting' | 'running'} state
 * @property {number | null} position 1-based place in line while waiting
 * @property {boolean} isAutoCompile
 * @property {number} slots
 * @property {number} running
 * @property {number} waiting
 */

export class CompileQueue {
  #slots
  #maxWaitMs
  #waiting = []
  #running = new Set()
  #runningUsers = new Set()

  /**
   * @param {Object} options
   * @param {number} [options.slots] number of compiles that may run at once; 0 disables the queue
   * @param {number} [options.maxWaitMs] how long a request may wait for a slot
   */
  constructor({ slots = 0, maxWaitMs = 5 * 60 * 1000 } = {}) {
    this.#slots = Number.isInteger(slots) && slots > 0 ? slots : 0
    this.#maxWaitMs = maxWaitMs
  }

  get enabled() {
    return this.#slots > 0
  }

  /**
   * Wait for a compile slot.
   *
   * Resolves with a `release` function that must be called once the compile
   * has finished. Rejects with a CompileQueueError when the wait times out,
   * is cancelled, or the signal aborts.
   *
   * @param {Object} request
   * @param {string} request.userKey
   * @param {string} request.projectId
   * @param {boolean} [request.isAutoCompile]
   * @param {AbortSignal} [request.signal]
   * @returns {Promise<() => void>}
   */
  acquire({ userKey, projectId, isAutoCompile = false, signal }) {
    if (!this.enabled) {
      return Promise.resolve(() => {})
    }
    if (signal?.aborted) {
      return Promise.reject(new CompileQueueError('aborted'))
    }
    return new Promise((resolve, reject) => {
      const entry = {
        userKey,
        projectId,
        isAutoCompile: Boolean(isAutoCompile),
        resolve,
        reject,
        signal,
        onAbort: null,
        timer: null,
      }
      entry.timer = setTimeout(
        () => this.#leave(entry, 'timeout'),
        this.#maxWaitMs
      )
      entry.timer.unref?.()
      if (signal) {
        entry.onAbort = () => this.#leave(entry, 'aborted')
        signal.addEventListener('abort', entry.onAbort, { once: true })
      }
      this.#waiting.push(entry)
      this.#dispatch()
    })
  }

  /**
   * Remove a user's waiting compiles for a project. Running compiles are not
   * affected. Returns whether anything was removed.
   */
  cancel(projectId, userKey) {
    const entries = this.#waiting.filter(
      entry => entry.projectId === projectId && entry.userKey === userKey
    )
    for (const entry of entries) {
      this.#leave(entry, 'cancelled')
    }
    return entries.length > 0
  }

  /**
   * Give a waiting auto-compile the priority of a requested compile. It keeps
   * its arrival time. Returns whether anything was promoted.
   */
  promote(projectId, userKey) {
    let promoted = false
    for (const entry of this.#waiting) {
      if (
        entry.isAutoCompile &&
        entry.projectId === projectId &&
        entry.userKey === userKey
      ) {
        entry.isAutoCompile = false
        promoted = true
      }
    }
    if (promoted) {
      this.#dispatch()
    }
    return promoted
  }

  /**
   * @returns {CompileQueueStatus}
   */
  getStatus(projectId, userKey) {
    const isMine = entry =>
      entry.projectId === projectId && entry.userKey === userKey
    const status = {
      state: 'idle',
      position: null,
      isAutoCompile: false,
      slots: this.#slots,
      running: this.#running.size,
      waiting: this.#waiting.length,
    }
    const line = this.#line()
    const index = line.findIndex(isMine)
    if (index !== -1) {
      status.state = 'waiting'
      status.position = index + 1
      status.isAutoCompile = line[index].isAutoCompile
    } else if ([...this.#running].some(isMine)) {
      status.state = 'running'
    }
    return status
  }

  // Requested compiles in arrival order, then auto-compiles in arrival order.
  #line() {
    return [
      ...this.#waiting.filter(entry => !entry.isAutoCompile),
      ...this.#waiting.filter(entry => entry.isAutoCompile),
    ]
  }

  #dispatch() {
    while (this.#running.size < this.#slots) {
      const next = this.#line().find(
        entry => !this.#runningUsers.has(entry.userKey)
      )
      if (!next) {
        return
      }
      this.#start(next)
    }
  }

  #start(entry) {
    this.#removeWaiting(entry)
    this.#running.add(entry)
    this.#runningUsers.add(entry.userKey)
    let released = false
    entry.resolve(() => {
      if (released) {
        return
      }
      released = true
      this.#running.delete(entry)
      this.#runningUsers.delete(entry.userKey)
      this.#dispatch()
    })
  }

  #leave(entry, reason) {
    if (!this.#waiting.includes(entry)) {
      return
    }
    this.#removeWaiting(entry)
    entry.reject(new CompileQueueError(reason))
  }

  #removeWaiting(entry) {
    const index = this.#waiting.indexOf(entry)
    if (index !== -1) {
      this.#waiting.splice(index, 1)
    }
    clearTimeout(entry.timer)
    if (entry.signal && entry.onAbort) {
      entry.signal.removeEventListener('abort', entry.onAbort)
    }
  }
}
