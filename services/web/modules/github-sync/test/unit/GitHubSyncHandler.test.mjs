import assert from 'node:assert/strict'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectGetter from '../../../../app/src/Features/Project/ProjectGetter.mjs'
import UserGetter from '../../../../app/src/Features/User/UserGetter.mjs'
import api from '../../app/src/GitHubApiClient.mjs'
import Handler from '../../app/src/GitHubSyncHandler.mjs'
import { GitConflictError, PermissionDeniedError } from '../../app/src/GitSyncErrors.mjs'
import HistoryManager from '../../app/src/HistoryManager.mjs'
import SyncStateManager from '../../app/src/SyncStateManager.mjs'
import TokenManager from '../../app/src/TokenManager.mjs'

vi.mock('@overleaf/settings', () => ({ default: { appName: 'Test LaTeX' } }))
vi.mock('../../../../app/src/Features/Project/ProjectGetter.mjs', () => ({
  default: { promises: { getProject: vi.fn() } },
}))
vi.mock('../../../../app/src/Features/User/UserGetter.mjs', () => ({
  default: { promises: { getUserEmail: vi.fn() } },
}))
vi.mock('../../../../app/src/Features/Uploads/ProjectUploadManager.mjs', () => ({ default: {} }))
vi.mock('../../../../app/src/Features/DocumentUpdater/DocumentUpdaterHandler.mjs', () => ({
  default: { promises: { flushProjectToMongo: vi.fn() } },
}))
vi.mock('../../app/src/GitHubApiClient.mjs', () => ({
  default: {
    maxConcurrency: 2,
    createRepo: vi.fn(),
    getBranchHead: vi.fn(),
    getCommit: vi.fn(),
    listBlobsAtCommit: vi.fn(),
    uploadBlob: vi.fn(),
    createTree: vi.fn(),
    createCommit: vi.fn(),
    updateBranch: vi.fn(),
    listNewCommitsWithStatus: vi.fn(),
  },
}))
vi.mock('../../app/src/HistoryManager.mjs', () => ({
  default: { latestVersion: vi.fn(), getPathsAtVersion: vi.fn(), getProjectFileBuffer: vi.fn() },
}))
vi.mock('../../app/src/SyncStateManager.mjs', () => ({
  default: { getProjectState: vi.fn(), createProjectState: vi.fn() },
}))
vi.mock('../../app/src/TokenManager.mjs', () => ({
  default: { getUserToken: vi.fn(), getProjectToken: vi.fn() },
}))

describe('GitHubSyncHandler export', function () {
  beforeEach(function () {
    ProjectGetter.promises.getProject.mockResolvedValue({ owner_ref: 'owner' })
    TokenManager.getUserToken.mockResolvedValue('owner-token')
    api.createRepo.mockResolvedValue({ full_name: 'fixture/repo', default_branch: 'main' })
    api.getBranchHead.mockResolvedValue('seed-head')
    api.getCommit.mockResolvedValue({ parents: [] })
    api.listBlobsAtCommit.mockResolvedValue([{ path: 'README.md' }])
    HistoryManager.latestVersion.mockResolvedValue(42)
    HistoryManager.getPathsAtVersion.mockResolvedValue({ paths: ['main.tex'] })
    api.uploadBlob.mockResolvedValue('latex-blob')
    api.createTree.mockResolvedValue('latex-tree')
    api.createCommit.mockResolvedValue('export-commit')
  })

  it('allows only the owner to export', async function () {
    await assert.rejects(Handler.exportProject('editor', 'project', {}), /Only the project owner/)
    expect(TokenManager.getUserToken).not.toHaveBeenCalled()
    expect(api.createRepo).not.toHaveBeenCalled()
  })

  it('publishes a fast-forward commit from the seed and then records sync state', async function () {
    await Handler.exportProject('owner', 'project', { name: 'repo' })

    expect(api.createCommit).toHaveBeenCalledExactlyOnceWith('owner-token', 'fixture/repo', {
      tree: 'latex-tree',
      parents: ['seed-head'],
      message: 'Initial Test LaTeX import',
    })
    expect(api.updateBranch).toHaveBeenCalledExactlyOnceWith('owner-token', 'fixture/repo', 'main', 'export-commit')
    expect(SyncStateManager.createProjectState).toHaveBeenCalledExactlyOnceWith('project', {
      mergeStatus: 'clean',
      defaultBranchName: 'main',
      lastSyncCommit: 'export-commit',
      lastSyncVersion: 42,
      repoFullName: 'fixture/repo',
    })
  })

  it('stops before uploading when the default branch has advanced before export', async function () {
    api.getCommit.mockResolvedValue({ parents: [{ sha: 'seed-head' }] })

    await assert.rejects(Handler.exportProject('owner', 'project', {}), /repository has changed/)
    expect(api.uploadBlob).not.toHaveBeenCalled()
    expect(api.updateBranch).not.toHaveBeenCalled()
  })

  it('leaves sync state unset after a concurrent default branch update', async function () {
    api.updateBranch.mockRejectedValue(new GitConflictError('reference advanced'))

    await assert.rejects(Handler.exportProject('owner', 'project', {}), GitConflictError)
    expect(api.updateBranch).toHaveBeenCalledTimes(1)
    expect(SyncStateManager.createProjectState).not.toHaveBeenCalled()
  })
})

describe('GitHubSyncHandler private repository access', function () {
  beforeEach(function () {
    SyncStateManager.getProjectState.mockResolvedValue({
      repoFullName: 'fixture/private',
      unmergedBranchName: 'private-conflict-branch',
      mergeStatus: 'conflict',
    })
    ProjectGetter.promises.getProject.mockResolvedValue({ owner_ref: 'owner' })
    UserGetter.promises.getUserEmail.mockResolvedValue('owner@example.test')
    TokenManager.getProjectToken.mockRejectedValue(new PermissionDeniedError('denied'))
  })

  it('omits repository and conflict branch details from a denied user’s state', async function () {
    expect(await Handler.getProjectState('editor', 'project')).to.deep.equal({
      mergeStatus: 'need-permission',
      ownerEmail: 'owner@example.test',
    })
  })

  it('checks caller access before returning the merge overview', async function () {
    await assert.rejects(Handler.getMergeOverview('editor', 'project'), PermissionDeniedError)
    expect(api.listNewCommitsWithStatus).not.toHaveBeenCalled()
  })
})
