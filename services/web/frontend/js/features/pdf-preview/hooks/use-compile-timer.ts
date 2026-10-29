import { useEffect, useRef, useState } from 'react'

// Whole seconds since the current compile started, ticking while it runs, and
// how long the last compile took. TeX cannot tell how far through a document
// it is, so the time is the progress the compile button can show.
export function useCompileTimer(compiling: boolean) {
  const [elapsed, setElapsed] = useState(0)
  const [lastSeconds, setLastSeconds] = useState<number | null>(null)
  const startedAt = useRef<number | null>(null)

  useEffect(() => {
    if (!compiling) {
      if (startedAt.current !== null) {
        setLastSeconds((Date.now() - startedAt.current) / 1000)
        startedAt.current = null
      }
      return
    }
    const start = Date.now()
    startedAt.current = start
    setElapsed(0)
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [compiling])

  return { elapsed, lastSeconds }
}
