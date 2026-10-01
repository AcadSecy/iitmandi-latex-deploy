import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as path from 'node:path'
import sinon from 'sinon'
import mongodb from 'mongodb-legacy'

const { ObjectId } = mongodb

const modulePath = path.join(
  import.meta.dirname,
  '../../../app/src/Retention.mjs'
)

const DAY_MS = 24 * 60 * 60 * 1000

describe('Retention', function () {
  beforeEach(async function (ctx) {
    ctx.owner = new ObjectId()
    ctx.collaborator = new ObjectId()
    ctx.projectId = new ObjectId()
    ctx.Settings = { retention: { trashDays: 30, auditLogDays: 365 } }
    ctx.trashTimes = {
      updateOne: sinon.stub().resolves({ upsertedCount: 0 }),
      deleteOne: sinon.stub().resolves(),
      find: sinon.stub().returns({
        limit: () => ({ toArray: async () => ctx.dueTrash }),
      }),
    }
    ctx.dueTrash = []
    ctx.trashedProjects = []
    ctx.db = {
      projects: {
        findOne: sinon.stub().resolves({
          _id: ctx.projectId,
          owner_ref: ctx.owner,
          trashed: [ctx.owner],
        }),
        find: sinon
          .stub()
          .returns({ toArray: async () => ctx.trashedProjects }),
      },
      userAuditLogEntries: {
        deleteMany: sinon.stub().resolves({ deletedCount: 7 }),
      },
      projectAuditLogEntries: {
        deleteMany: sinon.stub().resolves({ deletedCount: 3 }),
      },
    }
    ctx.ProjectDeleter = {
      promises: { deleteProject: sinon.stub().resolves() },
    }

    vi.doMock('@overleaf/settings', () => ({ default: ctx.Settings }))
    vi.doMock('../../../../../app/src/infrastructure/mongodb.mjs', () => ({
      db: ctx.db,
      ObjectId,
      getCollectionInternal: async () => ctx.trashTimes,
    }))
    vi.doMock(
      '../../../../../app/src/Features/Project/ProjectDeleter.mjs',
      () => ({ default: ctx.ProjectDeleter })
    )
    vi.doMock(
      '../../../../../app/src/Features/Project/DeletedProjectReasons.mjs',
      () => ({ DeletedProjectReasons: { TRASH_RETENTION: 'trash-retention' } })
    )

    ctx.Retention = (await import(modulePath)).default
  })

  describe('recordTrashed', function () {
    it('notes when the owner trashes their project', async function (ctx) {
      await ctx.Retention.recordTrashed(ctx.projectId.toString(), ctx.owner)
      const [filter, update, options] = ctx.trashTimes.updateOne.firstCall.args
      expect(filter).to.deep.equal({ projectId: ctx.projectId })
      expect(update.$setOnInsert.trashedAt).to.be.an.instanceOf(Date)
      expect(options).to.deep.equal({ upsert: true })
    })

    it('ignores collaborators hiding a shared project', async function (ctx) {
      await ctx.Retention.recordTrashed(
        ctx.projectId.toString(),
        ctx.collaborator
      )
      expect(ctx.trashTimes.updateOne.called).to.equal(false)
    })
  })

  describe('recordRestored', function () {
    it('forgets the trash date', async function (ctx) {
      await ctx.Retention.recordRestored(ctx.projectId.toString())
      expect(
        ctx.trashTimes.deleteOne.calledWith({ projectId: ctx.projectId })
      ).to.equal(true)
    })
  })

  describe('expireTrashedProjects', function () {
    it('does nothing when the trash is kept for ever', async function (ctx) {
      ctx.Settings.retention.trashDays = 0
      expect(await ctx.Retention.expireTrashedProjects()).to.deep.equal({
        dated: 0,
        deleted: 0,
      })
      expect(ctx.ProjectDeleter.promises.deleteProject.called).to.equal(false)
    })

    it('deletes projects that have been in the trash too long', async function (ctx) {
      ctx.dueTrash = [{ projectId: ctx.projectId }]
      const result = await ctx.Retention.expireTrashedProjects()
      expect(result.deleted).to.equal(1)
      expect(
        ctx.ProjectDeleter.promises.deleteProject.calledWith(ctx.projectId, {
          deleterUser: { _id: ctx.owner },
          deletedReason: 'trash-retention',
        })
      ).to.equal(true)
      expect(
        ctx.trashTimes.deleteOne.calledWith({ projectId: ctx.projectId })
      ).to.equal(true)
      const [query] = ctx.trashTimes.find.firstCall.args
      const cutoff = query.trashedAt.$lt.getTime()
      expect(Date.now() - cutoff).to.be.closeTo(30 * DAY_MS, 1000)
    })

    it('keeps projects that came out of the trash', async function (ctx) {
      ctx.dueTrash = [{ projectId: ctx.projectId }]
      ctx.db.projects.findOne.resolves({
        _id: ctx.projectId,
        owner_ref: ctx.owner,
        trashed: [ctx.collaborator],
      })
      const result = await ctx.Retention.expireTrashedProjects()
      expect(result.deleted).to.equal(0)
      expect(ctx.ProjectDeleter.promises.deleteProject.called).to.equal(false)
      expect(ctx.trashTimes.deleteOne.called).to.equal(true)
    })

    it('dates projects that were in the trash before dates were kept', async function (ctx) {
      ctx.trashedProjects = [{ _id: ctx.projectId }]
      ctx.trashTimes.updateOne.resolves({ upsertedCount: 1 })
      const result = await ctx.Retention.expireTrashedProjects()
      expect(result.dated).to.equal(1)
      expect(ctx.ProjectDeleter.promises.deleteProject.called).to.equal(false)
    })

    it('carries on when one project cannot be deleted', async function (ctx) {
      const other = new ObjectId()
      ctx.dueTrash = [{ projectId: ctx.projectId }, { projectId: other }]
      ctx.ProjectDeleter.promises.deleteProject
        .onFirstCall()
        .rejects(new Error('boom'))
      const result = await ctx.Retention.expireTrashedProjects()
      expect(result.deleted).to.equal(1)
      // the failed one keeps its date and is tried again next time
      expect(
        ctx.trashTimes.deleteOne.calledWith({ projectId: ctx.projectId })
      ).to.equal(false)
    })
  })

  describe('expireAuditLogs', function () {
    it('removes entries older than the retention period', async function (ctx) {
      expect(await ctx.Retention.expireAuditLogs()).to.deep.equal({
        userEntries: 7,
        projectEntries: 3,
      })
      const [query] = ctx.db.userAuditLogEntries.deleteMany.firstCall.args
      const cutoff = query.timestamp.$lt.getTime()
      expect(Date.now() - cutoff).to.be.closeTo(365 * DAY_MS, 1000)
    })

    it('keeps everything when the period is 0', async function (ctx) {
      ctx.Settings.retention.auditLogDays = 0
      await ctx.Retention.expireAuditLogs()
      expect(ctx.db.userAuditLogEntries.deleteMany.called).to.equal(false)
    })
  })
})
