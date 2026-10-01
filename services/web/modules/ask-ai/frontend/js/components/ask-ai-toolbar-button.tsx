import { useTranslation } from 'react-i18next'
import OLButton from '@/shared/components/ol/ol-button'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import { useCodeMirrorViewContext } from '@/features/source-editor/components/codemirror-context'
import { useAskAi } from '../use-ask-ai'
import { selectionPrompt } from '../open-assistant'

// Editor toolbar button: opens the assistant beside the editor with the
// selected text, or with an empty prompt when nothing is selected
function AskAiToolbarButton() {
  const { t } = useTranslation()
  const view = useCodeMirrorViewContext()
  const { settings, ask, modal } = useAskAi()

  if (!settings) return null

  const askAboutSelection = () => {
    const { from, to } = view.state.selection.main
    const text = view.state.sliceDoc(from, to).trim()
    ask(text ? selectionPrompt(text) : '')
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
