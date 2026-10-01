import { useEffect, useState } from 'react'
import { getJSON } from '@/infrastructure/fetch-json'
import { useProjectContext } from '@/shared/context/project-context'
import { debugConsole } from '@/utils/debugging'

export type CompileQueueStatus = {
  state: 'idle' | 'waiting' | 'running'
  position: number | null
  isAutoCompile: boolean
  // a compile that has run for a turn and waits for its next one
  paused?: boolean
  slots: number
  // 0 when the server never pauses compiles
  turnSeconds?: number
}

const FIRST_POLL_DELAY = 500
const POLL_INTERVAL = 2000
// A running compile can be paused when compiles take turns
const RUNNING_POLL_INTERVAL = 5000

// While a compile is in flight, report whether it is waiting in the server's
// compile queue and at which position.
export function useCompileQueueStatus(compiling: boolean) {
  const { projectId } = useProjectContext()
  const [status, setStatus] = useState<CompileQueueStatus | null>(null)

  useEffect(() => {
    if (!compiling) {
      return
    }

    const abortController = new AbortController()
    let timeout: number | undefined

    const poll = () => {
      getJSON<CompileQueueStatus>(`/project/${projectId}/compile/queue`, {
        signal: abortController.signal,
      })
        .then(queueStatus => {
          setStatus(queueStatus)
          // A server without a queue never makes anyone wait, and a running
          // compile only goes back to waiting when compiles take turns.
          if (queueStatus.slots === 0) {
            return
          }
          if (queueStatus.state !== 'running') {
            timeout = window.setTimeout(poll, POLL_INTERVAL)
          } else if (queueStatus.turnSeconds) {
            timeout = window.setTimeout(poll, RUNNING_POLL_INTERVAL)
          }
        })
        .catch(error => {
          if (!abortController.signal.aborted) {
            debugConsole.error(error)
          }
        })
    }

    timeout = window.setTimeout(poll, FIRST_POLL_DELAY)

    return () => {
      abortController.abort()
      window.clearTimeout(timeout)
      setStatus(null)
    }
  }, [compiling, projectId])

  return status
}
