import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { language } from '@codemirror/language'
import {
  OLModal,
  OLModalBody,
  OLModalFooter,
  OLModalHeader,
  OLModalTitle,
} from '@/shared/components/ol/ol-modal'
import OLButton from '@/shared/components/ol/ol-button'
import {
  useCodeMirrorStateContext,
  useCodeMirrorViewContext,
} from '@/features/source-editor/components/codemirror-context'
import { useCommandProvider } from '@/features/ide-react/hooks/use-command-provider'
import { usePermissionsContext } from '@/features/ide-react/context/permissions-context'
import { useLayoutContext } from '@/shared/context/layout-context'
import { useProjectContext } from '@/shared/context/project-context'
import useEventListener from '@/shared/hooks/use-event-listener'
import { postJSON } from '@/infrastructure/fetch-json'
import { debugConsole } from '@/utils/debugging'
import { logoInsertion } from '../logo-insertion'

export const INSERT_LOGO_EVENT = 'iitmandi-logo:insert'

// Rendered inside the editor: "Insert > IIT Mandi logo" (and the toolbar
// button) adds the logo file to the project if needed and inserts it at the
// cursor, so nobody has to find and upload the logo themselves.
function IITMandiLogoController() {
  const { t } = useTranslation()
  const view = useCodeMirrorViewContext()
  const state = useCodeMirrorStateContext()
  const { projectId } = useProjectContext()
  const { trackedWrite } = usePermissionsContext()
  const { view: layoutView } = useLayoutContext()
  const [error, setError] = useState(false)
  const isTeXFile = state.facet(language)?.name === 'latex'
  const canInsert = layoutView === 'editor' && isTeXFile && trackedWrite

  const insertLogo = useCallback(async () => {
    try {
      const { fileName } = await postJSON<{ fileName: string }>(
        `/project/${projectId}/iitmandi-logo`
      )
      const changes = logoInsertion(
        view.state.doc.toString(),
        view.state.selection.main.head,
        fileName
      )
      view.dispatch({ changes, userEvent: 'input.iitmandi-logo' })
      view.focus()
    } catch (err) {
      debugConsole.error(err)
      setError(true)
    }
  }, [projectId, view])

  useCommandProvider(() => {
    if (!canInsert) return
    return [
      {
        id: 'insert-iitmandi-logo',
        label: t('insert_iitmandi_logo'),
        menuLabel: t('iitmandi_logo'),
        handler: () => {
          insertLogo()
        },
      },
    ]
  }, [canInsert, insertLogo, t])

  const onInsertEvent = useCallback(() => {
    if (canInsert) insertLogo()
  }, [canInsert, insertLogo])
  useEventListener(INSERT_LOGO_EVENT, onInsertEvent)

  if (!error) return null
  return (
    <OLModal show onHide={() => setError(false)}>
      <OLModalHeader>
        <OLModalTitle>{t('insert_iitmandi_logo')}</OLModalTitle>
      </OLModalHeader>
      <OLModalBody>{t('iitmandi_logo_failed')}</OLModalBody>
      <OLModalFooter>
        <OLButton variant="secondary" onClick={() => setError(false)}>
          {t('close')}
        </OLButton>
      </OLModalFooter>
    </OLModal>
  )
}

export default IITMandiLogoController
