import { useEffect, useState } from 'react'
import { getJSON } from '@/infrastructure/fetch-json'
import { useProjectContext } from '@/shared/context/project-context'
import { debugConsole } from '@/utils/debugging'

export type CompileQueueStatus = {
  state: 'idle' | 'waiting' | 'running'
  position: number | null
  isAutoCompile: boolean
  slots: number
}

const FIRST_POLL_DELAY = 500
const POLL_INTERVAL = 2000

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
          // A running compile cannot go back to waiting, and a server without
          // a queue never makes anyone wait.
          if (queueStatus.state !== 'running' && queueStatus.slots > 0) {
            timeout = window.setTimeout(poll, POLL_INTERVAL)
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
