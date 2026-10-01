import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as path from 'node:path'
import sinon from 'sinon'
import MockRequest from '../../../../../test/unit/src/helpers/MockRequest.mjs'
import MockResponse from '../../../../../test/unit/src/helpers/MockResponse.mjs'

const modulePath = path.join(
  import.meta.dirname,
  '../../../app/src/StorageQuotaController.mjs'
)

const MB = 1024 * 1024

describe('StorageQuotaController', function () {
  beforeEach(async function (ctx) {
    ctx.StorageQuota = {
      enabled: sinon.stub().returns(true),
      getStatus: sinon
        .stub()
        .resolves({ usedBytes: 100 * MB, quotaBytes: 500 * MB }),
      addToUsage: sinon.stub().resolves(),
      getProjectBytes: sinon.stub().resolves(10 * MB),
    }
    ctx.ProjectGetter = {
      promises: {
        getProject: sinon.stub().resolves({ owner_ref: 'owner-1' }),
      },
    }
    vi.doMock('../../../app/src/StorageQuota.mjs', () => ({
      default: ctx.StorageQuota,
    }))
    vi.doMock(
      '../../../../../app/src/Features/Project/ProjectGetter.mjs',
      () => ({ default: ctx.ProjectGetter })
    )
    vi.doMock(
      '../../../../../app/src/Features/Authentication/SessionManager.mjs',
      () => ({ default: { getLoggedInUserId: () => 'user-1' } })
    )

    ctx.Controller = (await import(modulePath)).default
    ctx.req = new MockRequest(vi)
    ctx.req.params = {
      Project_id: 'project-1',
      project_id: 'project-1',
    }
    ctx.req.headers['content-length'] = String(1 * MB)
    ctx.res = new MockResponse(vi)
    ctx.next = sinon.stub()
  })

  describe('checkFileUpload', function () {
    it('does nothing when quotas are off', async function (ctx) {
      ctx.StorageQuota.enabled.returns(false)
      await ctx.Controller.checkFileUpload(ctx.req, ctx.res, ctx.next)
      expect(ctx.next.calledOnce).to.equal(true)
      expect(ctx.StorageQuota.getStatus.called).to.equal(false)
    })

    it("allows an upload that fits in the owner's quota", async function (ctx) {
      await ctx.Controller.checkFileUpload(ctx.req, ctx.res, ctx.next)
      expect(ctx.StorageQuota.getStatus.calledWith('owner-1')).to.equal(true)
      expect(ctx.next.calledOnce).to.equal(true)
      expect(ctx.StorageQuota.addToUsage.calledWith('owner-1', MB)).to.equal(
        true
      )
    })

    it("refuses an upload that would go past the owner's quota", async function (ctx) {
      ctx.StorageQuota.getStatus.resolves({
        usedBytes: 499.5 * MB,
        quotaBytes: 500 * MB,
      })
      await ctx.Controller.checkFileUpload(ctx.req, ctx.res, ctx.next)
      expect(ctx.next.called).to.equal(false)
      expect(ctx.res.statusCode).to.equal(422)
      expect(JSON.parse(ctx.res.body)).to.deep.equal({
        success: false,
        error: 'storage-quota-exceeded',
      })
      expect(ctx.StorageQuota.addToUsage.called).to.equal(false)
    })

    it('allows uploads for users without a limit', async function (ctx) {
      ctx.StorageQuota.getStatus.resolves({
        usedBytes: 9000 * MB,
        quotaBytes: null,
      })
      await ctx.Controller.checkFileUpload(ctx.req, ctx.res, ctx.next)
      expect(ctx.next.calledOnce).to.equal(true)
    })

    it('allows the upload when usage cannot be worked out', async function (ctx) {
      ctx.StorageQuota.getStatus.rejects(new Error('history unavailable'))
      await ctx.Controller.checkFileUpload(ctx.req, ctx.res, ctx.next)
      expect(ctx.next.calledOnce).to.equal(true)
      expect(ctx.next.firstCall.args).to.deep.equal([])
    })
  })

  describe('checkProjectUpload', function () {
    it("refuses a zip that would go past the user's quota", async function (ctx) {
      ctx.req.headers['content-length'] = String(450 * MB)
      await ctx.Controller.checkProjectUpload(ctx.req, ctx.res, ctx.next)
      expect(ctx.StorageQuota.getStatus.calledWith('user-1')).to.equal(true)
      expect(ctx.res.statusCode).to.equal(422)
      expect(JSON.parse(ctx.res.body)).to.deep.equal({
        success: false,
        error: 'storage_quota_exceeded',
      })
    })
  })

  describe('checkClone', function () {
    it('allows a copy that fits', async function (ctx) {
      await ctx.Controller.checkClone(ctx.req, ctx.res, ctx.next)
      expect(ctx.StorageQuota.getProjectBytes.calledWith('project-1')).to.equal(
        true
      )
      expect(ctx.next.calledOnce).to.equal(true)
    })

    it('refuses a copy that would go past the quota', async function (ctx) {
      ctx.StorageQuota.getProjectBytes.resolves(450 * MB)
      await ctx.Controller.checkClone(ctx.req, ctx.res, ctx.next)
      expect(ctx.next.called).to.equal(false)
      expect(ctx.res.statusCode).to.equal(400)
      expect(JSON.parse(ctx.res.body)).to.deep.equal({
        message: 'storage_quota_exceeded',
      })
    })

    it('allows the copy when the project cannot be sized', async function (ctx) {
      ctx.StorageQuota.getProjectBytes.rejects(new Error('history unavailable'))
      await ctx.Controller.checkClone(ctx.req, ctx.res, ctx.next)
      expect(ctx.next.calledOnce).to.equal(true)
    })
  })

  describe('checkLinkedFile', function () {
    it('allows a linked file below the quota', async function (ctx) {
      await ctx.Controller.checkLinkedFile(ctx.req, ctx.res, ctx.next)
      expect(ctx.next.calledOnce).to.equal(true)
    })

    it('refuses a linked file once the owner is at the quota', async function (ctx) {
      ctx.StorageQuota.getStatus.resolves({
        usedBytes: 500 * MB,
        quotaBytes: 500 * MB,
      })
      await ctx.Controller.checkLinkedFile(ctx.req, ctx.res, ctx.next)
      expect(ctx.next.called).to.equal(false)
      expect(ctx.res.statusCode).to.equal(400)
    })
  })

  describe('getUserStorage', function () {
    it('reports fresh usage and the quota', async function (ctx) {
      await ctx.Controller.getUserStorage(ctx.req, ctx.res)
      expect(
        ctx.StorageQuota.getStatus.calledWith('user-1', { fresh: true })
      ).to.equal(true)
      expect(JSON.parse(ctx.res.body)).to.deep.equal({
        enabled: true,
        usedBytes: 100 * MB,
        quotaBytes: 500 * MB,
      })
    })

    it('says so when quotas are off', async function (ctx) {
      ctx.StorageQuota.enabled.returns(false)
      await ctx.Controller.getUserStorage(ctx.req, ctx.res)
      expect(JSON.parse(ctx.res.body)).to.deep.equal({ enabled: false })
    })
  })
})
