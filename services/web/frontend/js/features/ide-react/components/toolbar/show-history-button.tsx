import { useTranslation } from 'react-i18next'
import OLIconButton from '@/shared/components/ol/ol-icon-button'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import { useLayoutContext } from '@/shared/context/layout-context'
import { useCallback } from 'react'
import { useEditorAnalytics } from '@/shared/hooks/use-editor-analytics'
import useIsNetworkStalled from '@/features/ide-react/hooks/use-is-network-stalled'
import { OLDropdownItem } from '@/shared/components/ol/ol-dropdown-menu'

export default function ShowHistoryButton({
  showLabel = false,
}: {
  showLabel?: boolean
}) {
  const { t } = useTranslation()
  const { view, setView, restoreView } = useLayoutContext()
  const { sendEvent } = useEditorAnalytics()
  const isDisabledDueToNetworkStall = useIsNetworkStalled()

  const toggleHistoryOpen = useCallback(() => {
    const action = view === 'history' ? 'close' : 'open'
    sendEvent('navigation-clicked-history', { action })
    if (view === 'history') {
      restoreView()
    } else {
      setView('history')
    }
  }, [view, setView, sendEvent, restoreView])

  if (showLabel) {
    return (
      <div className="ide-redesign-toolbar-button-container">
        <OLDropdownItem
          as="button"
          className="mobile-toolbar-action-row"
          onClick={toggleHistoryOpen}
          disabled={isDisabledDueToNetworkStall}
          leadingIcon="history"
        >
          {t('history')}
        </OLDropdownItem>
      </div>
    )
  }

  return (
    <div className="ide-redesign-toolbar-button-container">
      <OLTooltip
        id="tooltip-open-history"
        description={t('history')}
        overlayProps={{ delay: 0, placement: 'bottom' }}
      >
        <OLIconButton
          icon="history"
          className="ide-redesign-toolbar-button-subdued ide-redesign-toolbar-button-icon"
          onClick={toggleHistoryOpen}
          accessibilityLabel={t('history')}
          disabled={isDisabledDueToNetworkStall}
        />
      </OLTooltip>
    </div>
  )
}
