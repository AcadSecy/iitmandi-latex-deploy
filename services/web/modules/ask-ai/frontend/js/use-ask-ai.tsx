import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import customLocalStorage from '@/infrastructure/local-storage'
import {
  OLModal,
  OLModalBody,
  OLModalFooter,
  OLModalHeader,
  OLModalTitle,
} from '@/shared/components/ol/ol-modal'
import OLButton from '@/shared/components/ol/ol-button'
import { getAskAiSettings, openAssistant } from './open-assistant'

const NOTICE_ACCEPTED_KEY = 'ask-ai.notice-accepted'

/**
 * Ask the configured assistant. The first time, the user is told that the
 * assistant is an outside service before anything is sent to it. Render
 * `modal` next to the button that calls `ask`.
 */
export function useAskAi() {
  const { t } = useTranslation()
  const settings = useMemo(getAskAiSettings, [])
  // The prompt waiting for the user to accept the notice
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)

  const ask = useCallback(
    (prompt: string) => {
      if (!settings) return
      if (customLocalStorage.getItem(NOTICE_ACCEPTED_KEY)) {
        openAssistant(settings.url, prompt)
      } else {
        setPendingPrompt(prompt)
      }
    },
    [settings]
  )

  const accept = useCallback(() => {
    if (!settings || pendingPrompt === null) return
    customLocalStorage.setItem(NOTICE_ACCEPTED_KEY, true)
    openAssistant(settings.url, pendingPrompt)
    setPendingPrompt(null)
  }, [settings, pendingPrompt])

  const modal =
    settings && pendingPrompt !== null ? (
      <OLModal show onHide={() => setPendingPrompt(null)}>
        <OLModalHeader>
          <OLModalTitle>{t('ask_ai')}</OLModalTitle>
        </OLModalHeader>
        <OLModalBody>
          <p>{t('ask_ai_notice', { name: settings.name })}</p>
          <p className="small text-muted mb-0">{t('ask_ai_side_by_side')}</p>
        </OLModalBody>
        <OLModalFooter>
          <OLButton variant="secondary" onClick={() => setPendingPrompt(null)}>
            {t('cancel')}
          </OLButton>
          <OLButton variant="primary" onClick={accept}>
            {t('ask_ai_open', { name: settings.name })}
          </OLButton>
        </OLModalFooter>
      </OLModal>
    ) : null

  return { settings, ask, modal }
}
