import { useTranslation } from 'react-i18next'
import { useContext } from 'react'
import { PermissionsContext } from '@/features/ide-react/context/permissions-context'
import OLButton from '@/shared/components/ol/ol-button'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import { useCodeMirrorViewContext } from '@/features/source-editor/components/codemirror-context'
import { useAskAi } from '../use-ask-ai'
import { captureSelection } from '../selection-target'

// Review an explicitly selected excerpt. Readers can ask for an explanation;
// only writers can request an applicable replacement.
function AskAiToolbarButton() {
  const { t } = useTranslation()
  const view = useCodeMirrorViewContext()
  const { settings, ask, modal } = useAskAi()
  const permissions = useContext(PermissionsContext)

  if (!settings) return null

  const askAboutSelection = () => {
    const target = captureSelection(view)
    ask(
      target.text,
      permissions?.write ? 'selection' : 'error',
      permissions?.write ? target : undefined
    )
  }

  return (
    <>
      <OLTooltip
        id="ask-ai-toolbar-button"
        description={t('ask_ai_tooltip', { name: settings.name })}
        overlayProps={{ placement: 'bottom' }}
      >
        <OLButton
          variant="ghost"
          size="sm"
          leadingIcon="auto_awesome"
          onClick={askAboutSelection}
        >
          {t('ask_ai')}
        </OLButton>
      </OLTooltip>
      {modal}
    </>
  )
}

export default AskAiToolbarButton
