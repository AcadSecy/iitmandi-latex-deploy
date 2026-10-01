import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as path from 'node:path'
import sinon from 'sinon'
import MockRequest from '../../../../../test/unit/src/helpers/MockRequest.mjs'
import MockResponse from '../../../../../test/unit/src/helpers/MockResponse.mjs'

const modulePath = path.join(
  import.meta.dirname,
  '../../../app/src/IITMandiLogoController.mjs'
)

class DuplicateNameError extends Error {}

describe('IITMandiLogoController', function () {
  beforeEach(async function (ctx) {
    ctx.Settings = {
      institutionLogo: {
        path: '/logos/iitmandi-logo.jpg',
        fileName: 'iitmandi-logo.jpg',
      },
    }
    ctx.rootFolder = { _id: 'root-folder', fileRefs: [{ name: 'frog.jpg' }] }
    ctx.ProjectGetter = {
      promises: {
        getProject: sinon.stub().resolves({ rootFolder: [ctx.rootFolder] }),
      },
    }
    ctx.EditorController = {
      promises: { addFile: sinon.stub().resolves({ _id: 'file-1' }) },
    }
    vi.doMock('@overleaf/settings', () => ({ default: ctx.Settings }))
    vi.doMock(
      '../../../../../app/src/Features/Project/ProjectGetter.mjs',
      () => ({ default: ctx.ProjectGetter })
    )
    vi.doMock(
      '../../../../../app/src/Features/Editor/EditorController.mjs',
      () => ({ default: ctx.EditorController })
    )
    vi.doMock('../../../../../app/src/Features/Errors/Errors.js', () => ({
      default: { DuplicateNameError },
    }))
    vi.doMock(
      '../../../../../app/src/Features/Authentication/SessionManager.mjs',
      () => ({ default: { getLoggedInUserId: () => 'user-1' } })
    )

    ctx.Controller = (await import(modulePath)).default
    ctx.req = new MockRequest(vi)
    ctx.req.params = { Project_id: 'project-1' }
    ctx.res = new MockResponse(vi)
  })

  it('adds the logo to the top folder of the project', async function (ctx) {
    await ctx.Controller.addLogo(ctx.req, ctx.res)
    expect(
      ctx.EditorController.promises.addFile.calledWith(
        'project-1',
        'root-folder',
        'iitmandi-logo.jpg',
        '/logos/iitmandi-logo.jpg',
        null,
        'editor',
        'user-1'
      )
    ).to.equal(true)
    expect(JSON.parse(ctx.res.body)).to.deep.equal({
      fileName: 'iitmandi-logo.jpg',
      added: true,
    })
  })

  it('reuses a logo that is already there', async function (ctx) {
    ctx.rootFolder.fileRefs.push({ name: 'iitmandi-logo.jpg' })
    await ctx.Controller.addLogo(ctx.req, ctx.res)
    expect(ctx.EditorController.promises.addFile.called).to.equal(false)
    expect(JSON.parse(ctx.res.body)).to.deep.equal({
      fileName: 'iitmandi-logo.jpg',
      added: false,
    })
  })

  it('treats a logo added meanwhile as already there', async function (ctx) {
    ctx.EditorController.promises.addFile.rejects(
      new DuplicateNameError('file already exists')
    )
    await ctx.Controller.addLogo(ctx.req, ctx.res)
    expect(JSON.parse(ctx.res.body).fileName).to.equal('iitmandi-logo.jpg')
  })

  it('reports a missing project', async function (ctx) {
    ctx.ProjectGetter.promises.getProject.resolves(null)
    await ctx.Controller.addLogo(ctx.req, ctx.res)
    expect(ctx.res.statusCode).to.equal(404)
  })
})
