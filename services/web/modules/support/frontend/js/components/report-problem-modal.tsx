import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import getMeta from '@/utils/meta'
import { getJSON } from '@/infrastructure/fetch-json'
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
// menus opens. The button opens /report-problem in a new tab: any link
// followed in the editor's tab, even one that ends at a mailto: address,
// fires beforeunload, and the editor then treats its connection as closing.
// The dialog stays open so the address is still there if no email app opens.
// Also mounted, hidden, with the navbar, so it uses no editor context and
// asks for the address only once it is shown.
export default function ReportProblemModal({ show, handleHide }: Props) {
  const { t } = useTranslation()
  const [email, setEmail] = useState<string>()
  const reportUrl = `/report-problem?page=${encodeURIComponent(
    window.location.pathname
  )}`

  useEffect(() => {
    if (show && !email) {
      getJSON<{ email: string }>('/report-problem/address')
        .then(data => setEmail(data.email))
        .catch(() => setEmail(getMeta('ol-ExposedSettings').adminEmail))
    }
  }, [show, email])

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
          {t('write_an_email')}
        </OLButton>
      </OLModalFooter>
    </OLModal>
  )
}
