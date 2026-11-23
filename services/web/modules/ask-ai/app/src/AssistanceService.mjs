import { createHash, randomUUID } from 'node:crypto'
import {
  MAX_CONTEXT_BYTES,
  MAX_OUTPUT_TOKENS,
  POLICY_VERSION,
  SYSTEM_INSTRUCTIONS,
  containsSecret,
  contextBytes,
} from '../../shared/assistance-policy.mjs'
import { reserve, ACTIVE_KEY } from './AssistanceBudget.mjs'

export class AssistanceError extends Error {
  constructor(code, status = 400) {
    super(code)
    this.code = code
    this.status = status
  }
}

const fail = (code, status) => {
  throw new AssistanceError(code, status)
}
const positiveInt = value => Number.isSafeInteger(value) && value > 0

export function publicConfig(config, now = Date.now()) {
  if (!config || !['local', 'api'].includes(config.mode))
    return { enabled: false }
  let endpoint
  try {
    endpoint = new URL(config.endpoint)
  } catch {
    return { enabled: false }
  }
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    return { enabled: false }
  if (
    endpoint.protocol !== 'https:' &&
    !(config.mode === 'local' && endpoint.protocol === 'http:')
  )
    return { enabled: false }
  if (!config.model || !config.policySummary || !config.budgetEpoch)
    return { enabled: false }
  if (
    ![config.userDailyNanodollars, config.globalDailyNanodollars].every(
      positiveInt
    )
  )
    return { enabled: false }
  if (
    config.mode === 'api' &&
    (!config.apiKey ||
      !positiveInt(config.inputNanodollarsPerToken) ||
      !positiveInt(config.outputNanodollarsPerToken) ||
      !(Date.parse(config.priceValidUntil) > now))
  )
    return { enabled: false }
  const details = {
    enabled: true,
    mode: config.mode,
    destination: endpoint.href,
    model: config.model,
    policySummary: config.policySummary,
    maxContextBytes: MAX_CONTEXT_BYTES,
    instructions: SYSTEM_INSTRUCTIONS,
  }
  const revision = createHash('sha256')
    .update(
      JSON.stringify([
        POLICY_VERSION,
        details,
        config.inputNanodollarsPerToken,
        config.outputNanodollarsPerToken,
        config.priceValidUntil,
        config.userDailyNanodollars,
        config.globalDailyNanodollars,
      ])
    )
    .digest('hex')
  return { ...details, revision }
}

// Dependency injection keeps the adapter testable without real credentials.
export function createAssistanceService({
  getConfig,
  getRedis,
  fetchImpl = globalThis.fetch,
  clock = Date.now,
}) {
  return {
    config: () => publicConfig(getConfig(), clock()),
    async suggest(userId, body) {
      const config = getConfig()
      const visible = publicConfig(config, clock())
      if (!visible.enabled) fail('disabled', 503)
      if (
        !body ||
        Object.keys(body).some(
          k => !['context', 'kind', 'revision'].includes(k)
        )
      )
        fail('invalid_request')
      if (body.revision !== visible.revision) fail('review_again', 409)
      if (
        !['selection', 'error'].includes(body.kind) ||
        typeof body.context !== 'string' ||
        !body.context.trim()
      )
        fail('invalid_request')
      if (contextBytes(body.context) > MAX_CONTEXT_BYTES)
        fail('context_too_large', 413)
      if (containsSecret(body.context)) fail('secret_detected')
      const userText = JSON.stringify({
        kind: body.kind,
        excerpt: body.context,
      })
      // Byte-level BPE input upper bound plus conservative chat framing. This
      // intentionally admits less text than a token/4 approximation would.
      const inputBound =
        Buffer.byteLength(SYSTEM_INSTRUCTIONS) +
        Buffer.byteLength(userText) +
        256
      if (inputBound > 3000) fail('context_too_large', 413)
      const cost =
        config.mode === 'local'
          ? 0
          : inputBound * config.inputNanodollarsPerToken +
            MAX_OUTPUT_TOKENS * config.outputNanodollarsPerToken
      if (!Number.isSafeInteger(cost) || cost < 0) fail('disabled', 503)
      const id = randomUUID()
      const redis = getRedis()
      let admitted
      try {
        admitted = await reserve(redis, config, userId, id, clock(), cost)
      } catch {
        fail('unavailable', 503)
      }
      if (admitted !== 'ok')
        fail(
          admitted === 'unavailable' ? 'unavailable' : 'limit_reached',
          admitted === 'unavailable' ? 503 : 429
        )
      try {
        const response = await fetchImpl(config.endpoint, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
          headers: {
            'Content-Type': 'application/json',
            ...(config.apiKey
              ? { Authorization: `Bearer ${config.apiKey}` }
              : {}),
          },
          body: JSON.stringify({
            model: config.model,
            store: false,
            stream: false,
            ...(config.mode === 'local'
              ? { max_tokens: MAX_OUTPUT_TOKENS }
              : { max_completion_tokens: MAX_OUTPUT_TOKENS }),
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: SYSTEM_INSTRUCTIONS },
              { role: 'user', content: userText },
            ],
          }),
        })
        if (!response.ok) fail('provider_unavailable', 502)
        // Bound decompressed response bytes as well as requested output tokens.
        let raw = ''
        let bytes = 0
        const decoder = new TextDecoder()
        for await (const chunk of response.body) {
          bytes += chunk.byteLength
          if (bytes > 32768) fail('invalid_response', 502)
          raw += decoder.decode(chunk, { stream: true })
        }
        raw += decoder.decode()
        const result = JSON.parse(raw)
        const choice = result.choices?.[0]
        if (
          choice?.finish_reason !== 'stop' ||
          choice.message?.tool_calls?.length
        )
          fail('invalid_response', 502)
        const suggestion = JSON.parse(choice.message.content)
        if (
          !suggestion ||
          Object.keys(suggestion).some(
            k => !['explanation', 'replacement'].includes(k)
          ) ||
          typeof suggestion.explanation !== 'string' ||
          !suggestion.explanation.trim() ||
          suggestion.explanation.length > 12000 ||
          !(
            suggestion.replacement === null ||
            typeof suggestion.replacement === 'string'
          ) ||
          (suggestion.replacement?.length || 0) > 12000
        )
          fail('invalid_response', 502)
        // Error excerpts never authorize an edit to a document.
        return {
          explanation: suggestion.explanation,
          replacement:
            body.kind === 'selection' ? suggestion.replacement : null,
        }
      } catch (err) {
        if (err instanceof AssistanceError) throw err
        fail('provider_unavailable', 502)
      } finally {
        // Keep the full worst-case cost, including on timeout: no uncertain
        // refund can reopen a spending allowance. This is a charge reservation,
        // not a claim about the provider's actual invoice.
        await redis.zrem(ACTIVE_KEY, `${userId}:${id}`).catch(() => {})
      }
    },
  }
}
