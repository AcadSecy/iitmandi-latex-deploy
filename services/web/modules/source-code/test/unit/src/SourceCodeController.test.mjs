import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import * as path from 'node:path'
import sinon from 'sinon'
import MockRequest from '../../../../../test/unit/src/helpers/MockRequest.mjs'
import MockResponse from '../../../../../test/unit/src/helpers/MockResponse.mjs'

const modulePath = path.join(
  import.meta.dirname,
  '../../../app/src/SourceCodeController.mjs'
)

const REVISION = '0123456789abcdef0123456789abcdef01234567'

describe('SourceCodeController', function () {
  beforeEach(async function (ctx) {
    ctx.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'source-code-'))
    ctx.Settings = {
      sourceArchiveDir: ctx.dir,
      adminEmail: 'admin@example.com',
    }
    vi.doMock('@overleaf/settings', () => ({ default: ctx.Settings }))
    ctx.Controller = (await import(modulePath)).default
    ctx.req = new MockRequest(vi)
    ctx.res = new MockResponse(vi)
    ctx.res.download = sinon.stub()
    ctx.next = sinon.stub()
  })

  afterEach(async function (ctx) {
    await fs.rm(ctx.dir, { recursive: true, force: true })
  })

  async function writeArchive(ctx, revision = REVISION) {
    await fs.writeFile(path.join(ctx.dir, 'source.tar.gz'), 'archive')
    await fs.writeFile(path.join(ctx.dir, 'REVISION'), `${revision}\n`)
  }

  it('sends the archive under a name with the commit', async function (ctx) {
    await writeArchive(ctx)
    await ctx.Controller.download(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.download).to.have.been.calledOnce
    const [file, name, options] = ctx.res.download.firstCall.args
    expect(file).to.equal(path.join(ctx.dir, 'source.tar.gz'))
    expect(name).to.equal('iitmandi-latex-0123456789ab.tar.gz')
    expect(options.headers).to.include({
      'Content-Type': 'application/gzip',
      'X-Source-Revision': REVISION,
    })
    expect(ctx.next).not.to.have.been.called
  })

  it('answers 404 when the image was built without an archive', async function (ctx) {
    await ctx.Controller.download(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(404)
    expect(ctx.res.body).to.include('admin@example.com')
    expect(ctx.res.download).not.to.have.been.called
  })

  it('answers 404 when the revision file is not a commit', async function (ctx) {
    await writeArchive(ctx, 'not-a-commit')
    await ctx.Controller.download(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(404)
    expect(ctx.res.download).not.to.have.been.called
  })

  it('passes a failed transfer on to the error handler', async function (ctx) {
    await writeArchive(ctx)
    const error = new Error('read failed')
    ctx.res.download.callsFake((file, name, options, callback) =>
      callback(error)
    )
    await ctx.Controller.download(ctx.req, ctx.res, ctx.next)

    expect(ctx.next).to.have.been.calledWith(error)
  })
})
