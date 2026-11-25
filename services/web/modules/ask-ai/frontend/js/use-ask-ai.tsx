import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Compartment, StateEffect } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { PermissionsContext } from '@/features/ide-react/context/permissions-context'
import { getJSON, postJSON } from '@/infrastructure/fetch-json'
import getMeta from '@/utils/meta'
import {
  OLModal,
  OLModalBody,
  OLModalFooter,
  OLModalHeader,
  OLModalTitle,
} from '@/shared/components/ol/ol-modal'
import OLButton from '@/shared/components/ol/ol-button'
import OLFormControl from '@/shared/components/ol/ol-form-control'
import {
  getAskAiSettings,
  openAssistant,
  assistantDestination,
  type AskAiSettings,
} from './open-assistant'
import {
  applySuggestion,
  targetIsCurrent,
  type SelectionTarget,
} from './selection-target'
import {
  MAX_CONTEXT_BYTES,
  SYSTEM_INSTRUCTIONS,
  contextBytes,
  containsSecret,
  redactSecrets,
  wellFormed,
} from '../../shared/assistance-policy.mjs'

type Request = {
  context: string
  kind: 'selection' | 'error'
  target?: SelectionTarget
}
type Config = {
  enabled: boolean
  destination: string
  policySummary: string
  revision: string
}
type Suggestion = { explanation: string; replacement: string | null }

function AssistanceDialog({
  settings,
  request,
  onHide,
}: {
  settings: AskAiSettings
  request: Request
  onHide: () => void
}) {
  const { t } = useTranslation()
  const permissions = useContext(PermissionsContext)
  const [context, setContext] = useState(() =>
    redactSecrets(wellFormed(request.context))
  )
  const [wasRedacted] = useState(() => containsSecret(request.context))
  const [confirmed, setConfirmed] = useState(false)
  const [config, setConfig] = useState<Config | null>(null)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const projectId = getMeta('ol-project_id')
  const base = `/project/${projectId}/ai-assistance`

  useEffect(() => {
    const controller = new AbortController()
    if (settings.managed) {
      getJSON<Config>(`${base}/config`, { signal: controller.signal })
        .then(setConfig)
        .catch(() => {
          if (!controller.signal.aborted) setError('unavailable')
        })
    }
    return () => {
      controller.abort()
      abort.current?.abort()
    }
  }, [base, settings.managed])

  useEffect(() => {
    const target = request.target
    if (!target) return
    const compartment = new Compartment()
    target.view.dispatch({
      effects: StateEffect.appendConfig.of(
        compartment.of(
          EditorView.updateListener.of(update => {
            if (update.docChanged) setStale(true)
          })
        )
      ),
    })
    return () => {
      if (target.view.dom.isConnected)
        target.view.dispatch({ effects: compartment.reconfigure([]) })
    }
  }, [request.target])

  const destination = settings.managed
    ? config?.destination
    : assistantDestination(settings.url)
  const outbound = `${SYSTEM_INSTRUCTIONS}\n\n${JSON.stringify({ kind: request.kind, excerpt: context })}`
  const invalid =
    !context.trim() ||
    contextBytes(context) > MAX_CONTEXT_BYTES ||
    containsSecret(context)
  const canSend =
    !invalid &&
    confirmed &&
    !busy &&
    Boolean(destination) &&
    (!settings.managed || config?.enabled)
  const editableTarget =
    request.target &&
    permissions?.write &&
    !stale &&
    targetIsCurrent(request.target)

  const send = async () => {
    if (!canSend) return
    setError(null)
    if (!settings.managed) {
      try {
        openAssistant(settings.url, outbound)
        onHide()
      } catch {
        setError('context_too_large')
      }
      return
    }
    setBusy(true)
    setSuggestion(null)
    const controller = new AbortController()
    abort.current = controller
    try {
      const result = await postJSON<Suggestion>(`${base}/suggest`, {
        signal: controller.signal,
        body: { context, kind: request.kind, revision: config?.revision },
      })
      if (!controller.signal.aborted) {
        setSuggestion(result)
        setConfirmed(false)
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const failure = err as {
          data?: { code?: string }
          response?: { status?: number }
        }
        setError(
          failure.response?.status === 429
            ? 'limit_reached'
            : failure.data?.code === 'review_again'
              ? 'review_again'
              : 'unavailable'
        )
        setConfirmed(false)
        if (failure.data?.code === 'review_again') {
          setConfig(null)
          getJSON<Config>(`${base}/config`, { signal: controller.signal })
            .then(setConfig)
            .catch(() => {})
        }
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <OLModal show size="lg" onHide={onHide}>
      <OLModalHeader>
        <OLModalTitle>{t('ask_ai_review')}</OLModalTitle>
      </OLModalHeader>
      <OLModalBody>
        <p>
          {t('ask_ai_destination')}:{' '}
          <strong className="text-break">
            {destination || t('ask_ai_unavailable')}
          </strong>
        </p>
        <p>
          {settings.managed
            ? config?.policySummary
            : t('ask_ai_notice', { name: settings.name })}
        </p>
        {wasRedacted && <p role="status">{t('ask_ai_redacted')}</p>}
        <label className="form-label" htmlFor="ask-ai-context">
          {t('ask_ai_context')}
        </label>
        <OLFormControl
          id="ask-ai-context"
          as="textarea"
          rows={7}
          value={context}
          disabled={busy}
          onChange={event => {
            setContext(event.target.value)
            setConfirmed(false)
            setSuggestion(null)
          }}
          aria-describedby="ask-ai-context-limit"
        />
        <p id="ask-ai-context-limit" className="small">
          {t('ask_ai_context_limit', {
            used: contextBytes(context),
            limit: MAX_CONTEXT_BYTES,
          })}
        </p>
        <details>
          <summary>{t('ask_ai_exact_request')}</summary>
          <pre className="text-break" style={{ whiteSpace: 'pre-wrap' }}>
            {outbound}
          </pre>
        </details>
        {invalid && <p role="alert">{t('ask_ai_invalid_context')}</p>}
        {settings.managed && config && !config.enabled && (
          <p role="status">{t('ask_ai_unavailable')}</p>
        )}
        <label className="d-flex align-items-start gap-2 mt-3">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={busy}
            onChange={event => setConfirmed(event.target.checked)}
          />
          <span>{t('ask_ai_confirm')}</span>
        </label>
        {error && (
          <p role="alert">
            {t(
              error === 'limit_reached'
                ? 'ask_ai_limit_reached'
                : error === 'review_again'
                  ? 'ask_ai_review_again'
                  : error === 'context_too_large'
                    ? 'ask_ai_url_too_long'
                    : 'ask_ai_request_failed'
            )}
          </p>
        )}
        {busy && <p role="status">{t('ask_ai_waiting')}</p>}
        {suggestion && (
          <section aria-label={t('ask_ai_suggestion')}>
            <h3 className="h4">{t('ask_ai_suggestion')}</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{suggestion.explanation}</p>
            {suggestion.replacement !== null && request.target && (
              <>
                <h4 className="h5">{t('ask_ai_replace_selection')}</h4>
                <div className="row">
                  <div className="col-sm-6">
                    <strong>{t('ask_ai_before')}</strong>
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {request.target.text}
                    </pre>
                  </div>
                  <div className="col-sm-6">
                    <strong>{t('ask_ai_after')}</strong>
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {suggestion.replacement}
                    </pre>
                  </div>
                </div>
                {!editableTarget && <p role="status">{t('ask_ai_stale')}</p>}
                <OLButton
                  variant="primary"
                  disabled={
                    !editableTarget || containsSecret(suggestion.replacement)
                  }
                  onClick={() => {
                    if (
                      permissions?.write &&
                      request.target &&
                      applySuggestion(request.target, suggestion.replacement!)
                    )
                      onHide()
                    else setStale(true)
                  }}
                >
                  {t('ask_ai_apply')}
                </OLButton>
                <p className="small">{t('ask_ai_undo')}</p>
              </>
            )}
          </section>
        )}
      </OLModalBody>
      <OLModalFooter>
        <OLButton variant="secondary" onClick={onHide}>
          {t('cancel')}
        </OLButton>
        <OLButton variant="primary" disabled={!canSend} onClick={send}>
          {settings.managed
            ? t('ask_ai_send')
            : t('ask_ai_open', { name: settings.name })}
        </OLButton>
      </OLModalFooter>
    </OLModal>
  )
}

export function useAskAi() {
  const settings = useMemo(getAskAiSettings, [])
  const [request, setRequest] = useState<Request | null>(null)
  const ask = useCallback(
    (
      context: string,
      kind: Request['kind'] = 'error',
      target?: SelectionTarget
    ) => {
      if (settings) setRequest({ context, kind, target })
    },
    [settings]
  )
  return {
    settings,
    ask,
    modal:
      settings && request ? (
        <AssistanceDialog
          settings={settings}
          request={request}
          onHide={() => setRequest(null)}
        />
      ) : null,
  }
}
