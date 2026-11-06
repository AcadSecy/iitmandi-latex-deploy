import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as path from 'node:path'
import MockRequest from '../../../../../test/unit/src/helpers/MockRequest.mjs'
import MockResponse from '../../../../../test/unit/src/helpers/MockResponse.mjs'

const modulePath = path.join(
  import.meta.dirname,
  '../../../app/src/ReportProblemController.mjs'
)
const sourceCodePath = path.join(
  import.meta.dirname,
  '../../../../source-code/app/src/SourceCode.mjs'
)

describe('ReportProblemController', function () {
  beforeEach(async function (ctx) {
    vi.resetModules()
    ctx.getArchive = vi.fn().mockResolvedValue({
      revision: '0123456789abcdef0123456789abcdef01234567',
    })
    ctx.Settings = {
      adminEmail: 'admin@example.com',
      appName: 'IIT Mandi LaTeX',
      siteUrl: 'https://latex.example.com/',
    }
    vi.doMock('@overleaf/settings', () => ({ default: ctx.Settings }))
    vi.doMock(sourceCodePath, () => ({
      default: { getArchive: ctx.getArchive },
    }))
    ctx.Controller = (await import(modulePath)).default
    ctx.req = new MockRequest(vi)
    ctx.req.headers['user-agent'] = 'Mozilla/5.0 (X11; Linux) Firefox/130'
    ctx.res = new MockResponse(vi)
    ctx.report = async () => {
      await ctx.Controller.reportProblem(ctx.req, ctx.res)
      return new URL(ctx.res.redirectedTo)
    }
  })

  it('opens an email to support with the details filled in', async function (ctx) {
    ctx.Settings.supportEmail = 'support@example.com'
    ctx.req.query.page = '/project/abc123'
    const url = await ctx.report()

    expect(url.protocol + url.pathname).toBe('mailto:support@example.com')
    expect(url.searchParams.get('subject')).toBe(
      'IIT Mandi LaTeX: problem report'
    )
    const body = url.searchParams.get('body')
    expect(body).toContain('page: https://latex.example.com/project/abc123\n')
    expect(body).toContain('version: 0123456789ab\n')
    expect(body).toContain('browser: Mozilla/5.0 (X11; Linux) Firefox/130')
    // mail clients show a "+" as it is
    expect(ctx.res.redirectedTo).not.toContain('+')
  })

  it('writes to the admin address when no support address is set', async function (ctx) {
    const url = await ctx.report()

    expect(url.protocol + url.pathname).toBe('mailto:admin@example.com')
  })

  it('tells the dialog the support address', function (ctx) {
    ctx.Settings.supportEmail = 'support@example.com'
    ctx.Controller.supportAddress(ctx.req, ctx.res)

    expect(JSON.parse(ctx.res.body)).toEqual({ email: 'support@example.com' })
  })

  it('takes the page from the referrer, without its query string', async function (ctx) {
    ctx.req.headers.referer = 'https://latex.example.com/login?token=x#y'
    const body = (await ctx.report()).searchParams.get('body')

    expect(body).toContain('page: https://latex.example.com/login\n')
  })

  it('ignores pages on other sites', async function (ctx) {
    for (const page of ['//evil.example.com/x', 'https://evil.example.com']) {
      ctx.req.query.page = page
      const body = (await ctx.report()).searchParams.get('body')
      expect(body).toContain('page: unknown')
    }
  })

  it('keeps a hostile User-Agent on one line', async function (ctx) {
    ctx.req.headers['user-agent'] = 'Firefox\r\nbcc: someone@example.com'
    const body = (await ctx.report()).searchParams.get('body')

    expect(body).not.toMatch(/\nbcc:/)
  })

  it('still sends people on when the version cannot be read', async function (ctx) {
    ctx.getArchive.mockRejectedValue(new Error('EACCES'))
    ctx.req.headers.referer = 'not a url'
    delete ctx.req.headers['user-agent']
    const body = (await ctx.report()).searchParams.get('body')

    expect(body).toContain('page: unknown')
    expect(body).toContain('version: unknown')
    expect(body).toContain('browser: unknown')
  })
})
