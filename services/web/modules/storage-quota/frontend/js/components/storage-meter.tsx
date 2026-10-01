import { useTranslation } from 'react-i18next'
import { formatSize, usedShare, useStorageStatus } from '../storage-status'
import StorageBar from './storage-bar'

// Storage in use, at the bottom of the project list sidebar. Links to the
// storage section of the account settings, which lists the largest projects.
function StorageMeter() {
  const { t } = useTranslation()
  const { status } = useStorageStatus()

  if (!status?.enabled) return null
  const share = usedShare(status)

  return (
    <a
      href="/user/settings#storage"
      className="d-block px-3 py-2 text-reset text-decoration-none small"
      aria-label={t('storage')}
    >
      <div className="d-flex justify-content-between mb-1">
        <span>{t('storage')}</span>
        <span>
          {status.limitBytes == null
            ? formatSize(status.usedBytes)
            : t('storage_meter_used_of', {
                used: formatSize(status.usedBytes),
                limit: formatSize(status.limitBytes),
              })}
        </span>
      </div>
      {share != null && <StorageBar share={share} label={t('storage')} />}
    </a>
  )
}

export default StorageMeter
