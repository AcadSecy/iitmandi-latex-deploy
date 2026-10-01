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
 * - Compiles take turns (`turnMs`). A compile that has run for a whole turn
 *   while someone else waits is paused: its processes are frozen, its time
 *   limit stops counting, and it goes to the back of the line until a slot is
 *   free again. Long documents still finish, and nobody waits more than about
 *   a turn behind them. When nobody waits, a compile simply keeps running.
 *   A paused compile goes to the front of the line when it would otherwise
 *   miss `maxRequestMs`, the time a compile request may take in total.
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
 * @property {boolean} paused whether a compile that already ran is waiting for another turn
 * @property {number} slots
 * @property {number} turnSeconds 0 when compiles are never paused
 * @property {number} running
 * @property {number} waiting
 */

/**
 * @typedef {Object} PauseHandlers
 * @property {() => Promise<void>} suspend pauses the running compile
 * @property {() => Promise<void>} resume resumes it
 * @property {number} budgetMs how long the compile may run, not counting pauses
 */

export class CompileQueue {
  #slots
  #maxWaitMs
  #turnMs
  #maxPaused
  #maxRequestMs
  #waiting = []
  #running = new Set()
  #runningUsers = new Set()
  #pausedUsers = new Set()

  /**
   * @param {Object} options
   * @param {number} [options.slots] number of compiles that may run at once; 0 disables the queue
   * @param {number} [options.maxWaitMs] how long a request may wait for a slot
   * @param {number} [options.turnMs] how long a compile may run while others wait; 0 never pauses compiles
   * @param {number} [options.maxPaused] how many compiles may be paused at once (they keep their memory); defaults to `slots`
   * @param {number} [options.maxRequestMs] how long a compile request may take in total, including waits and pauses
   */
  constructor({
    slots = 0,
    maxWaitMs = 5 * 60 * 1000,
    turnMs = 0,
    maxPaused = 0,
    maxRequestMs = 9 * 60 * 1000,
  } = {}) {
    this.#slots = Number.isInteger(slots) && slots > 0 ? slots : 0
    this.#maxWaitMs = maxWaitMs
    this.#turnMs = turnMs > 0 ? turnMs : 0
    this.#maxPaused = maxPaused > 0 ? maxPaused : this.#slots
    this.#maxRequestMs = maxRequestMs
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
        deadline: Date.now() + this.#maxRequestMs,
        released: false,
        // taking turns
        handlers: null,
        turnStartedAt: 0,
        activeMs: 0,
        turnTimer: null,
        pausing: false,
        paused: false,
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
   * Let the queue pause the user's running compile while others wait.
   *
   * @param {string} projectId
   * @param {string} userKey
   * @param {PauseHandlers} handlers
   */
  allowPausing(projectId, userKey, handlers) {
    if (!this.#turnMs) {
      return
    }
    const entry = [...this.#running].find(
      entry => entry.projectId === projectId && entry.userKey === userKey
    )
    if (!entry) {
      return
    }
    entry.handlers = handlers
    this.#startTurnTimer(entry)
  }

  /**
   * Remove a user's waiting compiles for a project. Running and paused
   * compiles are not affected. Returns whether anything was removed.
   */
  cancel(projectId, userKey) {
    const entries = this.#waiting.filter(
      entry =>
        !entry.paused &&
        entry.projectId === projectId &&
        entry.userKey === userKey
    )
    for (const entry of entries) {
      this.#leave(entry, 'cancelled')
    }
    return entries.length > 0
  }

  /**
   * Whether the user has a paused compile for the project. It is still
   * running on the CLSI, so stopping it needs the CLSI.
   */
  hasPaused(projectId, userKey) {
    return this.#waiting.some(
      entry =>
        entry.paused &&
        entry.projectId === projectId &&
        entry.userKey === userKey
    )
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
      paused: false,
      slots: this.#slots,
      turnSeconds: Math.round(this.#turnMs / 1000),
      running: this.#running.size,
      waiting: this.#waiting.length,
    }
    const line = this.#line()
    const index = line.findIndex(isMine)
    if (index !== -1) {
      status.state = 'waiting'
      status.position = index + 1
      status.isAutoCompile = line[index].isAutoCompile
      status.paused = line[index].paused
    } else if ([...this.#running].some(isMine)) {
      status.state = 'running'
    }
    return status
  }

  // Paused compiles that would otherwise miss their deadline, then requested
  // compiles in arrival order, then auto-compiles in arrival order. A paused
  // compile rejoins the line when it is paused.
  #line() {
    const now = Date.now()
    const urgent = this.#waiting
      .filter(entry => entry.paused && now >= this.#urgentAt(entry))
      .sort((a, b) => this.#urgentAt(a) - this.#urgentAt(b))
    const rest = this.#waiting.filter(entry => !urgent.includes(entry))
    return [
      ...urgent,
      ...rest.filter(entry => !entry.isAutoCompile),
      ...rest.filter(entry => entry.isAutoCompile),
    ]
  }

  // From this time a paused compile needs its next turn: it has to finish the
  // rest of its time budget before the deadline, and waiting for a free slot
  // takes up to a turn.
  #urgentAt(entry, activeMs = entry.activeMs) {
    const remainingMs = Math.max(0, (entry.handlers?.budgetMs ?? 0) - activeMs)
    return entry.deadline - remainingMs - this.#turnMs
  }

  #canStart(entry) {
    if (entry.paused) {
      return true
    }
    return (
      !this.#runningUsers.has(entry.userKey) &&
      !this.#pausedUsers.has(entry.userKey)
    )
  }

  #dispatch() {
    while (this.#running.size < this.#slots) {
      const next = this.#line().find(entry => this.#canStart(entry))
      if (!next) {
        break
      }
      this.#start(next)
    }
    this.#pauseForWaiting()
  }

  // Pause compiles whose turn is over, one for each compile that could start.
  #pauseForWaiting() {
    if (!this.#turnMs) {
      return
    }
    const now = Date.now()
    const pausing = [...this.#running].filter(entry => entry.pausing).length
    const paused = this.#waiting.filter(entry => entry.paused).length
    let wanted =
      this.#line().filter(entry => this.#canStart(entry)).length - pausing
    let room = this.#maxPaused - paused - pausing
    const candidates = [...this.#running]
      .filter(entry => this.#mayPause(entry, now))
      .sort((a, b) => a.turnStartedAt - b.turnStartedAt)
    for (const entry of candidates) {
      if (wanted <= 0 || room <= 0) {
        return
      }
      wanted--
      room--
      this.#pause(entry)
    }
  }

  #mayPause(entry, now) {
    if (!entry.handlers || entry.pausing || entry.released) {
      return false
    }
    const turnMs = now - entry.turnStartedAt
    if (turnMs < this.#turnMs) {
      return false
    }
    // Paused now, it must not need its next turn straight away.
    return now + this.#turnMs <= this.#urgentAt(entry, entry.activeMs + turnMs)
  }

  #pause(entry) {
    entry.pausing = true
    clearTimeout(entry.turnTimer)
    const { suspend } = entry.handlers
    Promise.resolve()
      .then(suspend)
      .then(
        () => {
          entry.pausing = false
          if (entry.released || !this.#running.has(entry)) {
            return
          }
          entry.activeMs += Date.now() - entry.turnStartedAt
          this.#running.delete(entry)
          this.#runningUsers.delete(entry.userKey)
          entry.paused = true
          this.#pausedUsers.add(entry.userKey)
          this.#waiting.push(entry)
          this.#dispatch()
        },
        () => {
          // The compile has just finished, or cannot be paused: let it run.
          entry.pausing = false
          entry.handlers = null
        }
      )
  }

  #startTurnTimer(entry) {
    clearTimeout(entry.turnTimer)
    if (!this.#turnMs || !entry.handlers) {
      return
    }
    const elapsed = Date.now() - entry.turnStartedAt
    entry.turnTimer = setTimeout(
      () => this.#dispatch(),
      Math.max(0, this.#turnMs - elapsed)
    )
    entry.turnTimer.unref?.()
  }

  #start(entry) {
    this.#removeWaiting(entry)
    this.#running.add(entry)
    this.#runningUsers.add(entry.userKey)
    entry.turnStartedAt = Date.now()
    if (entry.paused) {
      entry.paused = false
      this.#pausedUsers.delete(entry.userKey)
      this.#startTurnTimer(entry)
      Promise.resolve()
        .then(entry.handlers.resume)
        .catch(() => {
          // The compile has ended while paused; its release follows.
        })
      return
    }
    entry.resolve(() => {
      if (entry.released) {
        return
      }
      entry.released = true
      clearTimeout(entry.turnTimer)
      if (this.#running.has(entry)) {
        this.#running.delete(entry)
        this.#runningUsers.delete(entry.userKey)
      } else if (entry.paused) {
        this.#removeWaiting(entry)
        this.#pausedUsers.delete(entry.userKey)
        entry.paused = false
      }
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
