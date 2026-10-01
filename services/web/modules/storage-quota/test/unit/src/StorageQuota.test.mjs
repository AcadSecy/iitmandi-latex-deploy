import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as path from 'node:path'
import sinon from 'sinon'
import mongodb from 'mongodb-legacy'

const { ObjectId } = mongodb

const modulePath = path.join(
  import.meta.dirname,
  '../../../app/src/StorageQuota.mjs'
)

const MB = 1024 * 1024
const USER_ID = '5a9414f259776c7900b300e6'

describe('StorageQuota', function () {
  beforeEach(async function (ctx) {
    ctx.Settings = { storageQuota: { defaultMB: 500 } }
    ctx.projects = [
      {
        _id: new ObjectId(),
        overleaf: { history: { id: 'history-1' } },
        rootFolder: [
          {
            fileRefs: [{ hash: 'aaa' }],
            folders: [{ fileRefs: [{ hash: 'bbb' }], folders: [] }],
          },
        ],
      },
      {
        _id: new ObjectId(),
        overleaf: { history: { id: 'history-2' } },
        rootFolder: [{ fileRefs: [], folders: [] }],
      },
    ]
    ctx.db = {
      projects: {
        find: sinon.stub().returns({ toArray: async () => ctx.projects }),
        findOne: sinon.stub().resolves(ctx.projects[0]),
      },
      docs: {
        aggregate: sinon.stub().returns({
          toArray: async () => [{ bytes: 2 * MB }],
        }),
      },
    }
    ctx.overrides = {
      findOne: sinon.stub().resolves(null),
      updateOne: sinon.stub().resolves(),
      deleteOne: sinon.stub().resolves(),
    }
    ctx.rclient = {
      get: sinon.stub().resolves(null),
      set: sinon.stub().resolves('OK'),
      eval: sinon.stub().resolves(1),
    }
    ctx.HistoryManager = {
      promises: {
        getBlobStats: sinon.stub().resolves({ totalBytes: 30 * MB }),
      },
    }

    vi.doMock('@overleaf/settings', () => ({ default: ctx.Settings }))
    vi.doMock('../../../../../app/src/infrastructure/mongodb.mjs', () => ({
      db: ctx.db,
      ObjectId,
      getCollectionInternal: async () => ctx.overrides,
    }))
    vi.doMock('../../../../../app/src/infrastructure/RedisWrapper.mjs', () => ({
      default: { client: () => ctx.rclient },
    }))
    vi.doMock(
      '../../../../../app/src/Features/History/HistoryManager.mjs',
      () => ({ default: ctx.HistoryManager })
    )

    ctx.StorageQuota = (await import(modulePath)).default
  })

  it('collects file hashes from nested folders', function (ctx) {
    expect(
      ctx.StorageQuota.collectFileHashes(ctx.projects[0].rootFolder[0])
    ).to.deep.equal(['aaa', 'bbb'])
  })

  describe('getUsage', function () {
    it('adds up current files and documents of owned projects', async function (ctx) {
      const usage = await ctx.StorageQuota.getUsage(USER_ID)
      // Only the first project has files; the second is skipped
      expect(ctx.HistoryManager.promises.getBlobStats.callCount).to.equal(1)
      expect(
        ctx.HistoryManager.promises.getBlobStats.calledWith('history-1', [
          'aaa',
          'bbb',
        ])
      ).to.equal(true)
      expect(usage).to.equal(32 * MB)
      expect(
        ctx.rclient.set.calledWith(
          `storage-usage:${USER_ID}`,
          32 * MB,
          'EX',
          300
        )
      ).to.equal(true)
    })

    it('uses the cached figure when there is one', async function (ctx) {
      ctx.rclient.get.resolves(String(7 * MB))
      expect(await ctx.StorageQuota.getUsage(USER_ID)).to.equal(7 * MB)
      expect(ctx.db.projects.find.called).to.equal(false)
    })

    it('recomputes when asked for a fresh figure', async function (ctx) {
      ctx.rclient.get.resolves(String(7 * MB))
      expect(
        await ctx.StorageQuota.getUsage(USER_ID, { fresh: true })
      ).to.equal(32 * MB)
    })
  })

  describe('getQuotaBytes', function () {
    it('uses the default quota', async function (ctx) {
      expect(await ctx.StorageQuota.getQuotaBytes(USER_ID)).to.equal(500 * MB)
    })

    it('uses a per-user quota set by an admin', async function (ctx) {
      ctx.overrides.findOne.resolves({ quotaMB: 2000 })
      expect(await ctx.StorageQuota.getQuotaBytes(USER_ID)).to.equal(
        2000 * MB
      )
    })

    it('treats a per-user quota of 0 as no limit', async function (ctx) {
      ctx.overrides.findOne.resolves({ quotaMB: 0 })
      expect(await ctx.StorageQuota.getQuotaBytes(USER_ID)).to.equal(null)
    })
  })

  describe('setQuotaMB', function () {
    it('stores a per-user quota', async function (ctx) {
      await ctx.StorageQuota.setQuotaMB(USER_ID, 1000)
      const [filter, update, options] = ctx.overrides.updateOne.firstCall.args
      expect(filter.userId.toString()).to.equal(USER_ID)
      expect(update.$set.quotaMB).to.equal(1000)
      expect(options).to.deep.equal({ upsert: true })
    })

    it('removes the per-user quota to go back to the default', async function (ctx) {
      await ctx.StorageQuota.setQuotaMB(USER_ID, null)
      expect(ctx.overrides.deleteOne.calledOnce).to.equal(true)
    })
  })

  describe('addToUsage', function () {
    it('adds to the cached figure only', async function (ctx) {
      await ctx.StorageQuota.addToUsage(USER_ID, MB)
      const [script, numberOfKeys, key, bytes] = ctx.rclient.eval.firstCall.args
      expect(script).to.match(/EXISTS/)
      expect(numberOfKeys).to.equal(1)
      expect(key).to.equal(`storage-usage:${USER_ID}`)
      expect(bytes).to.equal(MB)
    })

    it('ignores empty uploads', async function (ctx) {
      await ctx.StorageQuota.addToUsage(USER_ID, 0)
      expect(ctx.rclient.eval.called).to.equal(false)
    })
  })
})
