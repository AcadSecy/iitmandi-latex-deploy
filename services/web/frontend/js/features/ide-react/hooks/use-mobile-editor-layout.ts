import { useEffect, useState } from 'react'

export type MobilePane = 'files' | 'code' | 'pdf'

export function useMobileEditorLayout() {
  const [pane, setPane] = useState<MobilePane>('code')
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

  return { pane, setPane, isMobile }
}
