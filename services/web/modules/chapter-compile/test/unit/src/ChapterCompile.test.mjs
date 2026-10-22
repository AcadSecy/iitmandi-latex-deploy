import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as path from 'node:path'
import sinon from 'sinon'

const modulePath = path.join(
  import.meta.dirname,
  '../../../app/src/ChapterCompile.mjs'
)

function doc(id, ...lines) {
  return { _id: { toString: () => id }, lines }
}

describe('ChapterCompile', function () {
  beforeEach(async function (ctx) {
    ctx.docs = {
      '/thesis/main.tex': doc(
        'root',
        '\\include{chapters/intro}',
        '\\include{chapters/gone}',
        '\\include{my chapter}'
      ),
      '/thesis/chapters/intro.tex': doc('intro'),
      '/thesis/my chapter.tex': doc('spaced'),
      '/chapters/gone.tex': doc('outside'),
      '/other.tex': doc('other', '\\include{thesis/my chapter}'),
    }
    ctx.DocumentUpdaterHandler = {
      promises: { flushProjectToMongo: sinon.stub().resolves() },
    }
    ctx.ProjectGetter = {
      promises: {
        getProject: sinon
          .stub()
          .resolves({ rootDoc_id: { toString: () => 'root' } }),
      },
    }
    ctx.ProjectEntityHandler = {
      promises: { getAllDocs: sinon.stub().resolves(ctx.docs) },
    }
    vi.doMock(
      '../../../../../app/src/Features/DocumentUpdater/DocumentUpdaterHandler.mjs',
      () => ({ default: ctx.DocumentUpdaterHandler })
    )
    vi.doMock(
      '../../../../../app/src/Features/Project/ProjectGetter.mjs',
      () => ({ default: ctx.ProjectGetter })
    )
    vi.doMock(
      '../../../../../app/src/Features/Project/ProjectEntityHandler.mjs',
      () => ({ default: ctx.ProjectEntityHandler })
    )
    ctx.ChapterCompile = (await import(modulePath)).default
  })

  it('resolves chapters from the folder of a root file in a subfolder', async function (ctx) {
    expect(await ctx.ChapterCompile.getChapters('project-1')).toEqual([
      'chapters/intro',
      'my chapter',
    ])
  })

  it('reads the documents only after flushing open edits', async function (ctx) {
    await ctx.ChapterCompile.getChapters('project-1')
    expect(
      ctx.DocumentUpdaterHandler.promises.flushProjectToMongo.calledBefore(
        ctx.ProjectEntityHandler.promises.getAllDocs
      )
    ).toBe(true)
  })

  it('uses the root document a compile asks for', async function (ctx) {
    expect(await ctx.ChapterCompile.getChapters('project-1', 'other')).toEqual([
      'thesis/my chapter',
    ])
    expect(ctx.ProjectGetter.promises.getProject.called).toBe(false)
  })

  it('accepts only chapters that exist', async function (ctx) {
    expect(
      await ctx.ChapterCompile.hasChapter('project-1', 'chapters/intro')
    ).toBe(true)
    expect(
      await ctx.ChapterCompile.hasChapter('project-1', 'chapters/gone')
    ).toBe(false)
  })

  it('lists nothing without a root document', async function (ctx) {
    ctx.ProjectGetter.promises.getProject.resolves({})
    expect(await ctx.ChapterCompile.getChapters('project-1')).toEqual([])
  })
})
