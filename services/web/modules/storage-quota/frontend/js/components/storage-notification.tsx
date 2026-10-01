import { useTranslation } from 'react-i18next'
import Notification from '@/features/project-list/components/notifications/notification'
import OLButton from '@/shared/components/ol/ol-button'
import {
  formatSize,
  NEARLY_FULL,
  usedShare,
  useStorageStatus,
} from '../storage-status'

// Asks the user, on the project list, to free some space when their storage
// is full or nearly full
function StorageNotification() {
  const { t } = useTranslation()
  const { status } = useStorageStatus()
  const share = usedShare(status)

  if (!status?.enabled || share == null || share < NEARLY_FULL) return null

  const full = share >= 1
  let content
  if (full && status.serverLowOnSpace && status.quotaBytes != null) {
    content = t('storage_full_server_low', {
      quota: formatSize(status.quotaBytes),
    })
  } else if (full) {
    content = t('storage_full')
  } else {
    content = t('storage_nearly_full', {
      used: formatSize(status.usedBytes),
      limit: formatSize(status.limitBytes!),
    })
  }

  return (
    <Notification
      type={full ? 'error' : 'warning'}
      content={content}
      action={
        <OLButton variant="secondary" href="/user/settings#storage">
          {t('storage_free_up_space')}
        </OLButton>
      }
    />
  )
}

export default StorageNotification
