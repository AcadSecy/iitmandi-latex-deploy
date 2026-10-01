import { useTranslation } from 'react-i18next'
import { language } from '@codemirror/language'
import { useCodeMirrorStateContext } from '@/features/source-editor/components/codemirror-context'
import { ToolbarButton } from '@/features/source-editor/components/toolbar/toolbar-button'
import { OPEN_PAGE_SETUP_EVENT } from './page-setup-controller'

export const overflowGroupId = 'group-page-setup'

const openPageSetup = () => {
  window.dispatchEvent(new CustomEvent(OPEN_PAGE_SETUP_EVENT))
}

// "Page setup" at the start of the editor toolbar, in both the code and the
// visual editor, for people who would rather not edit the preamble
function PageSetupToolbarButton() {
  const { t } = useTranslation()
  const state = useCodeMirrorStateContext()
  if (state.facet(language)?.name !== 'latex') return null

  return (
    <div
      className="ol-cm-toolbar-button-group"
      data-overflow={overflowGroupId}
      aria-label={t('page_setup')}
    >
      <ToolbarButton
        id="toolbar-page-setup"
        label={t('page_setup')}
        command={openPageSetup}
        icon="format_line_spacing"
      />
    </div>
  )
}

export default PageSetupToolbarButton
