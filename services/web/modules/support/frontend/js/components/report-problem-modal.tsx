import { Trans, useTranslation } from 'react-i18next'
import getMeta from '@/utils/meta'
import { isSplitTestEnabled } from '@/utils/splitTestUtils'
import {
  OLModal,
  OLModalBody,
  OLModalFooter,
  OLModalHeader,
  OLModalTitle,
} from '@/shared/components/ol/ol-modal'
import OLButton from '@/shared/components/ol/ol-button'

type Props = {
  show: boolean
  handleHide: () => void
}

// Fills the contactUsModal slot, which "Contact us" in the editor's Help
// menus opens. The button opens /report-problem, which shows what the report
// will hold, in a new tab: any link followed in the editor's tab, even one
// that ends at a mailto: address, fires beforeunload, and the editor then
// treats its connection as closing. Also mounted, hidden, with the navbar, so
// it uses no editor context.
export default function ReportProblemModal({ show, handleHide }: Props) {
  const { t } = useTranslation()
  const email = getMeta('ol-ExposedSettings').adminEmail
  const reportUrl = `/report-problem?page=${encodeURIComponent(
    window.location.pathname
  )}`

  return (
    <OLModal
      show={show}
      onHide={handleHide}
      id="report-problem-modal"
      themed={isSplitTestEnabled('themed-modals')}
    >
      <OLModalHeader closeButton>
        <OLModalTitle>{t('report_a_problem')}</OLModalTitle>
      </OLModalHeader>
      <OLModalBody>
        <p>{t('report_a_problem_info')}</p>
        {email && (
          <p className="mb-0">
            <Trans
              i18nKey="report_a_problem_no_email_app"
              values={{ email }}
              components={[<strong key="email" />]}
              shouldUnescape
              tOptions={{ interpolation: { escapeValue: true } }}
            />
          </p>
        )}
      </OLModalBody>
      <OLModalFooter>
        <OLButton variant="secondary" onClick={handleHide}>
          {t('close')}
        </OLButton>
        <OLButton
          variant="primary"
          href={reportUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('continue')}
        </OLButton>
      </OLModalFooter>
    </OLModal>
  )
}
