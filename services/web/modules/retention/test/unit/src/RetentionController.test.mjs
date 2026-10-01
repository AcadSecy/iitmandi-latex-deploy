import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as path from 'node:path'
import sinon from 'sinon'
import MockRequest from '../../../../../test/unit/src/helpers/MockRequest.mjs'
import MockResponse from '../../../../../test/unit/src/helpers/MockResponse.mjs'

const modulePath = path.join(
  import.meta.dirname,
  '../../../app/src/RetentionController.mjs'
)

describe('RetentionController', function () {
  beforeEach(async function (ctx) {
    ctx.Retention = {
      recordTrashed: sinon.stub().resolves(),
      recordRestored: sinon.stub().resolves(),
      run: sinon.stub().resolves({ trash: { dated: 0, deleted: 2 } }),
    }
    vi.doMock('../../../app/src/Retention.mjs', () => ({
      default: ctx.Retention,
    }))
    vi.doMock(
      '../../../../../app/src/Features/Authentication/SessionManager.mjs',
      () => ({ default: { getLoggedInUserId: () => 'user-1' } })
    )
    ctx.Controller = (await import(modulePath)).default
    ctx.req = new MockRequest(vi)
    ctx.req.params = { project_id: 'project-1' }
    ctx.res = new MockResponse(vi)
    ctx.next = sinon.stub()
  })

  it('notes a trashed project and hands over to the trash route', async function (ctx) {
    await ctx.Controller.noteTrashed(ctx.req, ctx.res, ctx.next)
    expect(
      ctx.Retention.recordTrashed.calledWith('project-1', 'user-1')
    ).to.equal(true)
    expect(ctx.next.calledOnceWithExactly()).to.equal(true)
  })

  it('hands over even when the note fails', async function (ctx) {
    ctx.Retention.recordTrashed.rejects(new Error('mongo down'))
    await ctx.Controller.noteTrashed(ctx.req, ctx.res, ctx.next)
    expect(ctx.next.calledOnceWithExactly()).to.equal(true)
  })

  it('forgets the date when a project leaves the trash', async function (ctx) {
    await ctx.Controller.noteRestored(ctx.req, ctx.res, ctx.next)
    expect(ctx.Retention.recordRestored.calledWith('project-1')).to.equal(true)
    expect(ctx.next.calledOnceWithExactly()).to.equal(true)
  })

  it('runs the retention jobs', async function (ctx) {
    await ctx.Controller.run(ctx.req, ctx.res)
    expect(JSON.parse(ctx.res.body)).to.deep.equal({
      trash: { dated: 0, deleted: 2 },
    })
  })
})
