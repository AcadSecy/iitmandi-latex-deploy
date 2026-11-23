import { expect, it, vi } from 'vitest'
import { fetchJson } from '@overleaf/fetch-utils'
import api from '../../app/src/GitHubApiClient.mjs'

vi.mock('@overleaf/settings', () => ({ default: {} }))
vi.mock('@overleaf/fetch-utils', () => ({ fetchJson: vi.fn() }))

it('allows only fast-forward branch updates', async function () {
  fetchJson.mockResolvedValue({})

  await api.updateBranch('mock-token', 'fixture/repo', 'main', 'commit-sha')

  expect(fetchJson).toHaveBeenCalledExactlyOnceWith(
    'https://api.github.com/repos/fixture/repo/git/refs/heads/main',
    expect.objectContaining({
      method: 'PATCH',
      json: { sha: 'commit-sha', force: false },
    })
  )
})
