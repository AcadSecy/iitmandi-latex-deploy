import assert from 'node:assert/strict'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAssistanceService,
  publicConfig,
} from '../../../app/src/AssistanceService.mjs'
import {
  containsSecret,
  redactSecrets,
  contextBytes,
} from '../../../shared/assistance-policy.mjs'

describe('bounded assistance service', () => {
  let config, redis, fetchImpl, service, body
  const now = Date.parse('2026-11-16T00:00:00Z')
  beforeEach(() => {
    config = {
      mode: 'api',
      endpoint: 'https://provider.example/v1/chat/completions',
      model: 'approved-model',
      apiKey: 'server-only-fixture',
      policySummary: 'Synthetic test provider; no real requests.',
      budgetEpoch: 'approved-ledger-1',
      inputNanodollarsPerToken: 1000,
      outputNanodollarsPerToken: 5000,
      userDailyNanodollars: 150000000,
      globalDailyNanodollars: 10000000000,
      priceValidUntil: '2026-12-01',
    }
    redis = {
      eval: vi.fn().mockResolvedValue('ok'),
      zrem: vi.fn().mockResolvedValue(1),
    }
    fetchImpl = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: JSON.stringify({
                    explanation: 'Use a fraction.',
                    replacement: '\\frac{1}{2}',
                  }),
                },
              },
            ],
          })
        )
    )
    service = createAssistanceService({
      getConfig: () => config,
      getRedis: () => redis,
      fetchImpl,
      clock: () => now,
    })
    body = {
      context: '1/2',
      kind: 'selection',
      revision: service.config().revision,
    }
  })

  it('returns only public configuration and binds consent to policy, destination and prices', () => {
    expect(service.config()).not.toHaveProperty('apiKey')
    const revision = service.config().revision
    config.endpoint = 'https://other.example/v1/chat/completions'
    expect(service.config().revision).not.toEqual(revision)
  })
  it.each([
    ['mode', 'off'],
    ['apiKey', ''],
    ['priceValidUntil', '2020-01-01'],
    ['globalDailyNanodollars', 0],
    ['inputNanodollarsPerToken', NaN],
    ['endpoint', 'http://external.example/'],
    ['endpoint', 'https://user:pass@provider.example/'],
    ['endpoint', 'https://provider.example/?credential=secret'],
  ])('fails closed for invalid config %s=%s', async (key, value) => {
    config[key] = value
    expect(publicConfig(config, now)).toEqual({ enabled: false })
    await assert.rejects(service.suggest('user', body), { code: 'disabled' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(redis.eval).not.toHaveBeenCalled()
  })
  it.each([
    { revision: 'old' },
    { context: '🧪'.repeat(1000) },
    { context: 'password=synthetic-secret' },
    { context: '' },
    { kind: 'shell' },
    { endpoint: 'https://attacker.example' },
  ])('rejects invalid or unreviewed requests before dispatch', async change => {
    await assert.rejects(service.suggest('user', { ...body, ...change }), Error)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(redis.eval).not.toHaveBeenCalled()
  })
  it('makes exactly one bounded request containing only the approved excerpt and fixed instructions', async () => {
    const result = await service.suggest('user-1', body)
    expect(result.replacement).toEqual('\\frac{1}{2}')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toEqual(config.endpoint)
    expect(options.redirect).toEqual('error')
    const sent = JSON.parse(options.body)
    expect(sent).toMatchObject({
      model: 'approved-model',
      store: false,
      stream: false,
      max_completion_tokens: 1000,
    })
    expect(sent).not.toHaveProperty('tools')
    expect(JSON.parse(sent.messages[1].content)).toEqual({
      kind: 'selection',
      excerpt: '1/2',
    })
    expect(options.body).not.toContain('user-1')
    expect(options.body).not.toContain(config.apiKey)
    expect(redis.zrem).toHaveBeenCalledTimes(1)
  })
  it('never returns a replacement for an error excerpt', async () => {
    expect(
      (await service.suggest('user', { ...body, kind: 'error' })).replacement
    ).toBeNull()
  })
  it.each(['busy', 'rate', 'budget', 'unavailable'])(
    'does not call a provider when the ledger reports %s',
    async reason => {
      redis.eval.mockResolvedValue(reason)
      await assert.rejects(service.suggest('user', body), Error)
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  )
  it('fails closed on ledger connection loss', async () => {
    redis.eval.mockRejectedValue(new Error('redis offline'))
    await assert.rejects(service.suggest('user', body), {
      code: 'unavailable',
      status: 503,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it.each([
    new Response('echoed provider secret', { status: 500 }),
    new Response('not JSON'),
    new Response('x'.repeat(40000)),
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: 'tool_calls', message: {} }],
      })
    ),
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: '{"explanation":"x","replacement":null,"shell":"bad"}',
            },
          },
        ],
      })
    ),
  ])(
    'sanitizes malformed/provider errors and releases concurrency without refunding costs',
    async response => {
      fetchImpl.mockResolvedValue(response)
      await assert.rejects(service.suggest('user', body), Error)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(redis.eval).toHaveBeenCalledTimes(1)
      expect(redis.zrem).toHaveBeenCalledTimes(1)
    }
  )
  it('does not retry a timed out request or expose its error text', async () => {
    fetchImpl.mockRejectedValue(
      new Error('synthetic provider echoed credential')
    )
    await assert.rejects(service.suggest('user', body), {
      message: 'provider_unavailable',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('supports an explicitly configured local adapter without a provider key or token charge', async () => {
    Object.assign(config, {
      mode: 'local',
      endpoint: 'http://inference:8080/v1/chat/completions',
      apiKey: '',
    })
    await service.suggest('user', {
      ...body,
      revision: service.config().revision,
    })
    expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty(
      'Authorization'
    )
    expect(redis.eval.mock.calls[0].at(-3)).toEqual(0)
  })
  it('redacts recognized credentials, preserves normal LaTeX and counts UTF-8 bytes', () => {
    expect(containsSecret('\\section{Introduction}')).toBe(false)
    expect(containsSecret('sk-proj-abcdefghijklmnopqrstuv')).toBe(true)
    expect(redactSecrets('password=synthetic-secret')).not.toContain(
      'synthetic-secret'
    )
    expect(
      redactSecrets(
        '-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----'
      )
    ).not.toContain('fixture')
    expect(contextBytes('🧪')).toBe(4)
  })
})
