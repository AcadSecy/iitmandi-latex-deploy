import { useTranslation } from 'react-i18next'
import OLIconButton from '@/shared/components/ol/ol-icon-button'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import type { LogEntry } from '@/features/pdf-preview/util/types'
import { useAskAi } from '../use-ask-ai'
import { errorPrompt } from '../open-assistant'

// Button on each compile error and warning: asks the assistant what causes
// it and how to fix it
function AskAiLogEntryAction({
  logEntry,
  id,
}: {
  logEntry?: LogEntry
  id?: string
}) {
  const { t } = useTranslation()
  const { settings, ask, modal } = useAskAi()

  if (
    !settings ||
    !logEntry ||
    (logEntry.level !== 'error' && logEntry.level !== 'warning')
  ) {
    return null
  }

  const label = t('ask_ai_about_this_error', { name: settings.name })

  return (
    <>
      <OLTooltip
        id={`ask-ai-${id ?? logEntry.key}`}
        description={label}
        overlayProps={{ placement: 'bottom' }}
      >
        <OLIconButton
          variant="ghost"
          icon="auto_awesome"
          accessibilityLabel={label}
          onClick={() => ask(errorPrompt(logEntry))}
        />
      </OLTooltip>
      {modal}
    </>
  )
}

export default AskAiLogEntryAction
