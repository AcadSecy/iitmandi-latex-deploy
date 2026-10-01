import { useTranslation } from 'react-i18next'
import MaterialIcon from '@/shared/components/material-icon'
import OLButton from '@/shared/components/ol/ol-button'
import { useDetachCompileContext as useCompileContext } from '@/shared/context/detach-compile-context'

// Shown over a PDF from a compile that hit the time limit or was stopped: the
// PDF has only the pages that were typeset before it stopped.
export default function PdfPartialBanner() {
  const { t } = useTranslation()
  const { pdfFile, setShowLogs } = useCompileContext()

  if (!pdfFile?.partial) {
    return null
  }

  return (
    <div className="pdf-partial-banner-container">
      <div className="pdf-partial-banner" role="status">
        <MaterialIcon type="timer" />
        {pdfFile.partial === 'terminated'
          ? t('partial_pdf_after_stop')
          : t('partial_pdf_after_timeout')}
        <OLButton variant="link" size="sm" onClick={() => setShowLogs(true)}>
          {t('view_logs')}
        </OLButton>
      </div>
    </div>
  )
}
