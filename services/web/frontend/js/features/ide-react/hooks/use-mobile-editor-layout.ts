import { useEffect, useRef, useState } from 'react'
import { MobilePane, useLayoutContext } from '@/shared/context/layout-context'

export type { MobilePane } from '@/shared/context/layout-context'

export function useMobileEditorLayout() {
  const { mobilePane, setMobilePane } = useLayoutContext()
  const lastPane = useRef<MobilePane>('code')
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 767.98px)').matches
  )

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767.98px)')
    const onChange = () => setIsMobile(query.matches)
    onChange()
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (isMobile && mobilePane === null) {
      setMobilePane(lastPane.current)
    } else if (isMobile && mobilePane !== null) {
      lastPane.current = mobilePane
    } else if (!isMobile && mobilePane !== null) {
      setMobilePane(null)
    }
  }, [isMobile, mobilePane, setMobilePane])

  return {
    pane: mobilePane ?? lastPane.current,
    setPane: setMobilePane,
    isMobile,
  }
}
