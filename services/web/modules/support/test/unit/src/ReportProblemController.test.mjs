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
    ctx.preview = async () => {
      await ctx.Controller.showReport(ctx.req, ctx.res)
      return ctx.res.renderedVariables
    }
    ctx.send = async () => {
      await ctx.Controller.sendReport(ctx.req, ctx.res)
      return new URL(ctx.res.redirectedTo)
    }
  })

  describe('showReport', function () {
    it('shows the details the email will hold', async function (ctx) {
      ctx.req.query.page = '/project/abc123'
      const { page, details } = await ctx.preview()

      expect(ctx.res.renderedTemplate).toMatch(/views\/report-problem$/)
      expect(page).toBe('/project/abc123')
      expect(details).toEqual({
        page: 'https://latex.example.com/project/abc123',
        version: '0123456789ab',
        browser: 'Mozilla/5.0 (X11; Linux) Firefox/130',
      })
    })

    it('takes the page from the referrer, without its query string', async function (ctx) {
      ctx.req.headers.referer = 'https://latex.example.com/login?token=x#y'
      const { page } = await ctx.preview()

      expect(page).toBe('/login')
    })

    it('ignores a referrer on another site', async function (ctx) {
      for (const referer of [
        'https://evil.example.com/project/abc123',
        'http://latex.example.com/project/abc123',
        'https://latex.example.com:8443/project/abc123',
      ]) {
        ctx.req.headers.referer = referer
        const { page, details } = await ctx.preview()
        expect(page).toBe('')
        expect(details.page).toBe('')
      }
    })

    it('ignores pages on other sites', async function (ctx) {
      for (const page of ['//evil.example.com/x', 'https://evil.example.com']) {
        ctx.req.query.page = page
        expect((await ctx.preview()).page).toBe('')
      }
    })

    it('removes control characters and limits lengths', async function (ctx) {
      ctx.req.query.page = '/project/a\tb\u0000c\u2028d' + 'x'.repeat(500)
      ctx.req.headers['user-agent'] =
        'Firefox\r\nbcc: a@example.com\t\u0085\u2029' + 'y'.repeat(500)
      const { page, details } = await ctx.preview()

      expect(page).toMatch(/^\/project\/a b c dx+$/)
      expect(page).toHaveLength(200)
      expect(details.browser).toMatch(/^Firefox bcc: a@example.com y+$/)
      expect(details.browser).toHaveLength(300)
    })

    it('still works when the version cannot be read', async function (ctx) {
      ctx.getArchive.mockRejectedValue(new Error('EACCES'))
      ctx.req.headers.referer = 'not a url'
      delete ctx.req.headers['user-agent']
      const { page, details } = await ctx.preview()

      expect(page).toBe('')
      expect(details).toEqual({ page: '', version: 'unknown', browser: 'unknown' })
    })
  })

  describe('sendReport', function () {
    it('opens an email to the admin address with the details filled in', async function (ctx) {
      ctx.req.query = { page: '/project/abc123', include_page: '1' }
      const url = await ctx.send()

      expect(url.protocol + url.pathname).toBe('mailto:admin@example.com')
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

    it('leaves the page out when the student unticks it', async function (ctx) {
      ctx.req.query = { page: '/project/abc123' }
      const body = (await ctx.send()).searchParams.get('body')

      expect(body).not.toContain('page:')
      expect(body).not.toContain('abc123')
      expect(body).toContain('version: 0123456789ab\n')
    })

    it('ignores pages on other sites', async function (ctx) {
      ctx.req.query = { page: '//evil.example.com/x', include_page: '1' }
      const body = (await ctx.send()).searchParams.get('body')

      expect(body).not.toContain('page:')
    })

    it('keeps a hostile User-Agent on one line', async function (ctx) {
      ctx.req.headers['user-agent'] = 'Firefox\r\nbcc: someone@example.com'
      const body = (await ctx.send()).searchParams.get('body')

      expect(body).not.toMatch(/\nbcc:/)
    })
  })
})
