import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { language } from '@codemirror/language'
import { useCodeMirrorStateContext } from '@/features/source-editor/components/codemirror-context'
import { useCommandProvider } from '@/features/ide-react/hooks/use-command-provider'
import { usePermissionsContext } from '@/features/ide-react/context/permissions-context'
import { useLayoutContext } from '@/shared/context/layout-context'
import useEventListener from '@/shared/hooks/use-event-listener'
import PageSetupModal from './page-setup-modal'

export const OPEN_PAGE_SETUP_EVENT = 'page-setup:open'

// Rendered inside the editor: offers "Page setup" in the Format menu and the
// command palette, and opens the dialog when the toolbar button asks for it.
function PageSetupController() {
  const { t } = useTranslation()
  const state = useCodeMirrorStateContext()
  const { trackedWrite } = usePermissionsContext()
  const { view: layoutView } = useLayoutContext()
  const [show, setShow] = useState(false)
  const isTeXFile = state.facet(language)?.name === 'latex'
  const canChange = layoutView === 'editor' && isTeXFile && trackedWrite

  useCommandProvider(() => {
    if (!canChange) return
    return [
      {
        id: 'page-setup',
        label: t('page_setup'),
        menuLabel: t('page_setup_menu'),
        handler: () => setShow(true),
      },
    ]
  }, [canChange, t])

  const open = useCallback(() => setShow(true), [])
  useEventListener(OPEN_PAGE_SETUP_EVENT, open)

  if (!show || !canChange) return null
  return <PageSetupModal onHide={() => setShow(false)} />
}

export default PageSetupController
