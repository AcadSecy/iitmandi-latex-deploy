import { useTranslation } from 'react-i18next'
import { language } from '@codemirror/language'
import { useCodeMirrorStateContext } from '@/features/source-editor/components/codemirror-context'
import { ToolbarButton } from '@/features/source-editor/components/toolbar/toolbar-button'
import { INSERT_LOGO_EVENT } from './iitmandi-logo-controller'

export const overflowGroupId = 'group-iitmandi-logo'

const insertLogo = () => {
  window.dispatchEvent(new CustomEvent(INSERT_LOGO_EVENT))
}

// Editor toolbar button that inserts the IIT Mandi logo at the cursor
function IITMandiLogoToolbarButton() {
  const { t } = useTranslation()
  const state = useCodeMirrorStateContext()
  if (state.facet(language)?.name !== 'latex') return null

  return (
    <div
      className="ol-cm-toolbar-button-group"
      data-overflow={overflowGroupId}
      aria-label={t('insert_iitmandi_logo')}
    >
      <ToolbarButton
        id="toolbar-iitmandi-logo"
        label={t('insert_iitmandi_logo')}
        command={insertLogo}
        icon="account_balance"
      />
    </div>
  )
}

export default IITMandiLogoToolbarButton
