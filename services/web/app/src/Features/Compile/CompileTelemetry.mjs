const MINUTE = 60000
export const WINDOWS = [5, 15, 60]
export const OUTCOMES = ['success', 'failure', 'timeout', 'stopped', 'other']

export class CompileTelemetry {
  #buckets = new Map()
  #startedAt
  #clock
  constructor(clock = Date.now) {
    this.#clock = clock
    this.#startedAt = clock()
  }

  record(status) {
    const outcome =
      status === 'success'
        ? 'success'
        : ['failure', 'error'].includes(status)
          ? 'failure'
          : ['timedout', 'timeout'].includes(status)
            ? 'timeout'
            : ['terminated', 'stopped'].includes(status)
              ? 'stopped'
              : 'other'
    const minute = Math.floor(this.#clock() / MINUTE) * MINUTE
    for (const key of this.#buckets.keys())
      if (key < minute - 60 * MINUTE) this.#buckets.delete(key)
    const bucket =
      this.#buckets.get(minute) ||
      Object.fromEntries(OUTCOMES.map(key => [key, 0]))
    bucket[outcome]++
    this.#buckets.set(minute, bucket)
    return outcome
  }

  snapshot(minutes = 15) {
    if (!WINDOWS.includes(minutes))
      throw new RangeError('Unsupported aggregation window')
    const end = this.#clock()
    // Completed and current minute buckets; display the exact bounds in the UI.
    const start = Math.floor((end - minutes * MINUTE) / MINUTE) * MINUTE
    const totals = Object.fromEntries(OUTCOMES.map(key => [key, 0]))
    const buckets = []
    for (let time = start; time <= end; time += MINUTE) {
      const counts =
        this.#buckets.get(time) ||
        Object.fromEntries(OUTCOMES.map(key => [key, 0]))
      for (const key of OUTCOMES) totals[key] += counts[key]
      buckets.push({ time, ...counts })
    }
    return { start, end, recordedSince: this.#startedAt, totals, buckets }
  }
}

export default new CompileTelemetry()
