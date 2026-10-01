import { FC, PropsWithChildren, useEffect } from 'react'
import { FetchError, postJSON } from '@/infrastructure/fetch-json'
import type { EditorPlace } from './editor-place'

const ACTIVITY_EVENTS = [
  'keydown',
  'mousedown',
  'mousemove',
  'wheel',
  'touchstart',
] as const

// Keeps the user's place in the editor while they are active, and lets it
// lapse once they have been idle for a while, so someone in the waiting room
// can have it. If the place is gone when the user comes back, reloading the
// page takes them to the waiting room.
const EditorPlaceKeeper: FC<PropsWithChildren> = ({ children }) => {
  useEffect(() => {
    let lastActivity = Date.now()
    let idleMs = Infinity
    let timer: number | undefined
    let stopped = false

    const stop = () => {
      stopped = true
      window.clearInterval(timer)
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity)
      }
    }

    const check = async () => {
      try {
        const place = await postJSON<EditorPlace>('/editor-places/check')
        if (stopped) return
        if (!place.enabled) {
          stop()
          return
        }
        idleMs = place.idleMinutes * 60 * 1000
        if (!place.admitted) {
          window.location.reload()
          return
        }
        if (timer === undefined) {
          timer = window.setInterval(
            renewIfActive,
            place.heartbeatSeconds * 1000
          )
        }
      } catch (error) {
        // The module is not loaded on the server
        if (error instanceof FetchError && error.response?.status === 404) {
          stop()
        }
      }
    }

    const renewIfActive = () => {
      if (Date.now() - lastActivity < idleMs) {
        check()
      }
    }

    function onActivity() {
      const wasIdle = Date.now() - lastActivity >= idleMs
      lastActivity = Date.now()
      // The place may have lapsed while the user was away
      if (wasIdle && !stopped) {
        check()
      }
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true })
    }
    check()

    return stop
  }, [])

  return <>{children}</>
}

export default EditorPlaceKeeper
