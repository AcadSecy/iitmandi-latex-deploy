import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('assistance route membership boundary', () => {
  let authorize, invited, requireMember, req, res, next
  beforeEach(async () => {
    authorize = vi.fn().mockResolvedValue('readAndWrite')
    invited = vi.fn().mockResolvedValue(true)
    vi.doMock('@overleaf/settings', () => ({ default: {} }))
    vi.doMock(
      '../../../../../app/src/Features/Authorization/AuthorizationManager.mjs',
      () => ({
        default: { promises: { getPrivilegeLevelForProject: authorize } },
      })
    )
    vi.doMock(
      '../../../../../app/src/Features/Collaborators/CollaboratorsGetter.mjs',
      () => ({
        default: { promises: { isUserInvitedMemberOfProject: invited } },
      })
    )
    vi.doMock(
      '../../../../../app/src/infrastructure/AsyncLocalStorage.mjs',
      () => ({ default: { middleware: vi.fn() } })
    )
    vi.doMock('../../../../../app/src/infrastructure/RedisWrapper.mjs', () => ({
      default: { client: vi.fn() },
    }))
    ;({ requireMember } = await import('../../../app/src/AssistanceRouter.mjs'))
    req = {
      session: { user: { _id: 'fixture-user' } },
      params: { Project_id: '123456789012345678901234' },
      method: 'POST',
      body: { kind: 'selection' },
    }
    res = { status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn() }
    next = vi.fn()
  })
  it('rejects logged-out direct requests', async () => {
    req.session = {}
    await requireMember(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(authorize).not.toHaveBeenCalled()
  })
  it('rejects unrelated accounts and share-link-only membership', async () => {
    invited.mockResolvedValue(false)
    await requireMember(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
  it('rejects replacement requests from readers', async () => {
    authorize.mockResolvedValue('readOnly')
    await requireMember(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })
  it('rejects an explicit none privilege even if a collaborator record exists', async () => {
    authorize.mockResolvedValue('none')
    req.body.kind = 'error'
    await requireMember(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
  it('allows an invited reader to request an error explanation', async () => {
    authorize.mockResolvedValue('readOnly')
    req.body.kind = 'error'
    await requireMember(req, res, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })
  it('allows a project owner without a separate collaborator record', async () => {
    authorize.mockResolvedValue('owner')
    invited.mockResolvedValue(false)
    await requireMember(req, res, next)
    expect(next).toHaveBeenCalledTimes(1)
  })
})
