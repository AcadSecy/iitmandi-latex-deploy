import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useWaitForI18n from '@/shared/hooks/use-wait-for-i18n'
import withErrorBoundary from '@/infrastructure/error-boundary'
import { GenericErrorBoundaryFallback } from '@/shared/components/generic-error-boundary-fallback'
import { postJSON } from '@/infrastructure/fetch-json'
import OLRow from '@/shared/components/ol/ol-row'
import OLCol from '@/shared/components/ol/ol-col'
import OLPageContentCard from '@/shared/components/ol/ol-page-content-card'
import LoadingSpinner from '@/shared/components/loading-spinner'
import type { EditorPlace } from './editor-place'

const CHECK_INTERVAL_MS = 10 * 1000

function WaitingRoomRoot({
  initialPosition,
  limit,
}: {
  initialPosition: number
  limit: number
}) {
  const { isReady } = useWaitForI18n()
  const { t } = useTranslation()
  const [position, setPosition] = useState(initialPosition)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const place = await postJSON<EditorPlace>('/editor-places/check')
        if (cancelled) return
        if (place.admitted) {
          // This page is at the project's URL, so reloading opens the editor
          window.location.reload()
        } else {
          setPosition(place.position)
        }
      } catch {
        // Try again at the next check
      }
    }
    const timer = window.setInterval(check, CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  if (!isReady) return null

  return (
    <div className="container">
      <OLRow>
        <OLCol lg={{ span: 8, offset: 2 }}>
          <OLPageContentCard>
            <h1>{t('editor_waiting_room_title')}</h1>
            <p className="lead">
              {t('editor_waiting_room_position', { position })}
            </p>
            <p>{t('editor_waiting_room_explanation', { limit })}</p>
            <LoadingSpinner />
            <p className="mt-4">
              <a href="/project">{t('back_to_your_projects')}</a>
            </p>
          </OLPageContentCard>
        </OLCol>
      </OLRow>
    </div>
  )
}

export default withErrorBoundary(WaitingRoomRoot, () => (
  <GenericErrorBoundaryFallback />
))
