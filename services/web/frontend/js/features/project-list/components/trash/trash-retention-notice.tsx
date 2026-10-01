import { useTranslation } from 'react-i18next'
import getMeta from '@/utils/meta'

// Above the trash: how long projects stay in it (TRASH_RETENTION_DAYS)
function TrashRetentionNotice() {
  const { t } = useTranslation()
  const days = getMeta('ol-ExposedSettings').trashRetentionDays
  if (!days) return null
  return (
    <p className="text-muted small mb-2">
      {t('trash_retention_notice', { days })}
    </p>
  )
}

export default TrashRetentionNotice
