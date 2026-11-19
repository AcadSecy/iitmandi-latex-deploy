import { FC, useEffect, useMemo, useRef } from 'react'
import { useFileTreePathContext } from '@/features/file-tree/contexts/file-tree-path'
import { useTranslation } from 'react-i18next'
import Notification from '@/shared/components/notification'
import OLButton from '@/shared/components/ol/ol-button'
import { sendMB } from '@/infrastructure/event-tracking'
import { useConnectionContext } from '@/features/ide-react/context/connection-context'
import { useEditorManagerContext } from '@/features/ide-react/context/editor-manager-context'
import { downloadFileContent } from '@/utils/download-file'

const MAX_UNSAVED_ALERT_SECONDS = 15

export const UnsavedDocsAlert: FC<{ unsavedDocs: Map<string, number> }> = ({
  unsavedDocs,
}) => {
  const { isConnected } = useConnectionContext()
  return (
    <>
      {[...unsavedDocs.entries()].map(
        ([docId, seconds]) =>
          (!isConnected || seconds >= MAX_UNSAVED_ALERT_SECONDS) && (
            <UnsavedDocAlert key={docId} docId={docId} seconds={seconds} />
          )
      )}
    </>
  )
}

const UnsavedDocAlert: FC<{ docId: string; seconds: number }> = ({
  docId,
  seconds,
}) => {
  const { pathInFolder, findEntityByPath } = useFileTreePathContext()
  const { socket, isConnected } = useConnectionContext()
  const { openDocs } = useEditorManagerContext()
  const { t } = useTranslation()

  const recordedRef = useRef(false)

  useEffect(() => {
    if (!recordedRef.current) {
      recordedRef.current = true
      sendMB('unsaved-doc-alert-shown', {
        docId,
        transport: socket.socket.transport?.name,
      })
    }
  }, [docId, socket])

  const doc = useMemo(() => {
    const path = pathInFolder(docId)
    return path ? findEntityByPath(path) : null
  }, [docId, findEntityByPath, pathInFolder])

  if (!doc) {
    return null
  }

  const filename = doc.entity.name
  const download = () => {
    const snapshot = openDocs.getUnsavedSnapshot(docId)
    if (snapshot != null) downloadFileContent(snapshot, `unsaved-${filename}`)
  }

  return (
    <div className="notification-list">
      <Notification
        type="warning"
        content={
          isConnected
            ? t('saving_notification_with_seconds', {
                docname: filename,
                seconds,
              })
            : t('disconnected_unsaved_document', { docname: filename })
        }
        action={
          openDocs.getUnsavedSnapshot(docId) != null ? (
            <OLButton
              aria-label={t('download_local_copy_of_document', {
                docname: filename,
              })}
              onClick={download}
              size="sm"
              variant="secondary"
            >
              {t('download_local_copy')}
            </OLButton>
          ) : undefined
        }
      />
    </div>
  )
}
