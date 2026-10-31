import { useTranslation } from 'react-i18next'
import MaterialIcon from '@/shared/components/material-icon'
import OLButton from '@/shared/components/ol/ol-button'
import { useDetachCompileContext as useCompileContext } from '@/shared/context/detach-compile-context'

// Shown over the PDF of the last good compile when the latest compile failed,
// so the PDF is not mistaken for the current state of the project. With no
// earlier PDF there is nothing to mark: the logs explain the failure.
export default function PdfFailedCompileBanner() {
  const { t } = useTranslation()
  const { error, pdfFile, setShowLogs } = useCompileContext()

  if (error !== 'failure' || !pdfFile || pdfFile.partial) {
    return null
  }

  return (
    <div className="pdf-partial-banner-container">
      <div className="pdf-partial-banner" role="status">
        <MaterialIcon type="history" />
        {t('stale_pdf_after_failed_compile')}
        <OLButton variant="link" size="sm" onClick={() => setShowLogs(true)}>
          {t('view_logs')}
        </OLButton>
      </div>
    </div>
  )
}
