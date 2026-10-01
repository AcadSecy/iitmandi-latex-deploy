import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getJSON } from '@/infrastructure/fetch-json'
import LoadingSpinner from '@/shared/components/loading-spinner'

type StorageStatus =
  | { enabled: false }
  | { enabled: true; usedBytes: number; quotaBytes: number | null }

const MB = 1024 * 1024

function formatMB(bytes: number) {
  const mb = bytes / MB
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

// Account settings section showing how much of their storage quota the user
// has used. Hidden when there is no quota.
function StorageSection() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<StorageStatus>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    getJSON<StorageStatus>('/user/storage')
      .then(setStatus)
      .catch(() => setFailed(true))
  }, [])

  if (failed || status?.enabled === false) return null

  let body
  if (!status) {
    body = <LoadingSpinner />
  } else if (status.quotaBytes == null) {
    body = (
      <p>
        {t('storage_used_no_limit', { used: formatMB(status.usedBytes) })}
      </p>
    )
  } else {
    const percent = Math.min(
      100,
      Math.round((status.usedBytes / status.quotaBytes) * 100)
    )
    body = (
      <>
        <p>
          {t('storage_used_of_quota', {
            used: formatMB(status.usedBytes),
            quota: formatMB(status.quotaBytes),
          })}
        </p>
        <div
          role="progressbar"
          aria-label={t('storage')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          style={{
            height: '8px',
            borderRadius: '4px',
            background: 'var(--bg-light-tertiary)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${percent}%`,
              background:
                percent >= 90 ? 'var(--bg-danger-01)' : 'var(--bg-accent-01)',
            }}
          />
        </div>
        <p className="small text-muted mt-2">
          {t('storage_quota_explanation')}
        </p>
      </>
    )
  }

  return (
    <>
      <h3>{t('storage')}</h3>
      {body}
      <hr />
    </>
  )
}

export default StorageSection
