import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as path from 'node:path'
import sinon from 'sinon'
import MockRequest from '../../../../../test/unit/src/helpers/MockRequest.mjs'
import MockResponse from '../../../../../test/unit/src/helpers/MockResponse.mjs'

const modulePath = path.join(
  import.meta.dirname,
  '../../../app/src/EditorWaitingRoomController.mjs'
)

describe('EditorWaitingRoomController', function () {
  beforeEach(async function (ctx) {
    ctx.user = { _id: 'user-1', isAdmin: false }
    ctx.Settings = { editorPlaces: { limit: 50, idleMinutes: 30 } }
    ctx.EditorPlaces = {
      enabled: sinon.stub().returns(true),
      acquire: sinon.stub().resolves({ admitted: true, position: 0 }),
      stats: sinon.stub().resolves({ limit: 50, holding: 12, waiting: 0 }),
    }

    vi.doMock('@overleaf/settings', () => ({ default: ctx.Settings }))
    vi.doMock('../../../app/src/EditorPlaces.mjs', () => ({
      default: ctx.EditorPlaces,
    }))
    vi.doMock(
      '../../../../../app/src/Features/Authentication/SessionManager.mjs',
      () => ({
        default: {
          getSessionUser: () => ctx.user,
          getLoggedInUserId: () => ctx.user?._id,
        },
      })
    )
    vi.doMock(
      '../../../../../app/src/Features/Helpers/AdminAuthorizationHelper.mjs',
      () => ({
        default: { hasAdminAccess: user => Boolean(user?.isAdmin) },
      })
    )

    ctx.Controller = (await import(modulePath)).default
    ctx.req = new MockRequest(vi)
    ctx.res = new MockResponse(vi)
    ctx.next = sinon.stub()
  })

  describe('openEditor', function () {
    it('opens the editor when the limit is off', async function (ctx) {
      ctx.EditorPlaces.enabled.returns(false)
      await ctx.Controller.openEditor(ctx.req, ctx.res, ctx.next)
      expect(ctx.next.calledOnce).to.equal(true)
      expect(ctx.EditorPlaces.acquire.called).to.equal(false)
    })

    it('lets admins in without taking a place', async function (ctx) {
      ctx.user.isAdmin = true
      await ctx.Controller.openEditor(ctx.req, ctx.res, ctx.next)
      expect(ctx.next.calledOnce).to.equal(true)
      expect(ctx.EditorPlaces.acquire.called).to.equal(false)
    })

    it('leaves logged-out visitors to the editor route', async function (ctx) {
      ctx.user = null
      await ctx.Controller.openEditor(ctx.req, ctx.res, ctx.next)
      expect(ctx.next.calledOnce).to.equal(true)
      expect(ctx.EditorPlaces.acquire.called).to.equal(false)
    })

    it('opens the editor when the user gets a place', async function (ctx) {
      await ctx.Controller.openEditor(ctx.req, ctx.res, ctx.next)
      expect(ctx.EditorPlaces.acquire.calledWith('user-1')).to.equal(true)
      expect(ctx.next.calledOnce).to.equal(true)
      expect(ctx.res.rendered).to.equal(false)
    })

    it('shows the waiting room when every place is taken', async function (ctx) {
      ctx.EditorPlaces.acquire.resolves({ admitted: false, position: 3 })
      await ctx.Controller.openEditor(ctx.req, ctx.res, ctx.next)
      expect(ctx.next.called).to.equal(false)
      expect(ctx.res.renderedTemplate).to.match(/waiting-room$/)
      expect(ctx.res.renderedVariables).to.deep.include({
        position: 3,
        limit: 50,
      })
    })

    it('lets the user in when Redis fails', async function (ctx) {
      ctx.EditorPlaces.acquire.rejects(new Error('redis down'))
      await ctx.Controller.openEditor(ctx.req, ctx.res, ctx.next)
      expect(ctx.next.calledOnce).to.equal(true)
      expect(ctx.next.firstCall.args).to.deep.equal([])
    })
  })

  describe('checkPlace', function () {
    it('reports the limit as off for exempt users', async function (ctx) {
      ctx.user.isAdmin = true
      await ctx.Controller.checkPlace(ctx.req, ctx.res)
      expect(JSON.parse(ctx.res.body)).to.deep.equal({
        enabled: false,
        admitted: true,
      })
    })

    it('reports the queue position while waiting', async function (ctx) {
      ctx.EditorPlaces.acquire.resolves({ admitted: false, position: 2 })
      await ctx.Controller.checkPlace(ctx.req, ctx.res)
      expect(JSON.parse(ctx.res.body)).to.deep.equal({
        enabled: true,
        admitted: false,
        position: 2,
        heartbeatSeconds: 60,
        idleMinutes: 30,
      })
    })

    it('admits the user when Redis fails', async function (ctx) {
      ctx.EditorPlaces.acquire.rejects(new Error('redis down'))
      await ctx.Controller.checkPlace(ctx.req, ctx.res)
      expect(JSON.parse(ctx.res.body)).to.include({
        enabled: true,
        admitted: true,
      })
    })
  })

  describe('getStats', function () {
    it('returns the current numbers', async function (ctx) {
      await ctx.Controller.getStats(ctx.req, ctx.res)
      expect(JSON.parse(ctx.res.body)).to.deep.equal({
        limit: 50,
        holding: 12,
        waiting: 0,
      })
    })

    it('says so when the limit is off', async function (ctx) {
      ctx.EditorPlaces.enabled.returns(false)
      await ctx.Controller.getStats(ctx.req, ctx.res)
      expect(JSON.parse(ctx.res.body)).to.deep.equal({
        limit: 0,
        holding: null,
        waiting: null,
      })
    })
  })
})
