import { afterEach, expect, it, vi } from 'vitest'

vi.mock('@overleaf/settings', () => ({ default: { siteUrl: 'https://latex.example.test/' } }))
vi.mock('../../../../app/src/infrastructure/Modules.mjs', () => ({
  default: { hooks: { attach: vi.fn() } },
}))
vi.mock('../../app/src/GitHubSyncRouter.mjs', () => ({ default: { apply: vi.fn() } }))
vi.mock('../../app/src/SyncStateManager.mjs', () => ({ default: {} }))
vi.mock('../../app/src/TokenManager.mjs', () => ({ default: {} }))

afterEach(() => vi.unstubAllEnvs())

it.each([
  ['false', 'example-id', 'example-secret', false],
  ['true', 'example-id', ' ', false],
  ['true', 'example-id', 'example-secret', true],
])('registers GitHub routes only with an explicit flag and both credentials (%s)', async (enabled, id, secret, expected) => {
  vi.stubEnv('GITHUB_SYNC_ENABLED', enabled)
  vi.stubEnv('GITHUB_SYNC_CLIENT_ID', id)
  vi.stubEnv('GITHUB_SYNC_CLIENT_SECRET', secret)

  const { default: githubSyncModule } = await import('../../index.mjs')
  const { default: settings } = await import('@overleaf/settings')

  expect(settings.enableGithubSync).to.equal(expected)
  expect(Boolean(githubSyncModule.router)).to.equal(expected)
})
