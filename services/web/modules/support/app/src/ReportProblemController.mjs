import Path from 'node:path'
import Settings from '@overleaf/settings'
import { expressify } from '@overleaf/promise-utils'
import SourceCode from '../../../source-code/app/src/SourceCode.mjs'
import EmailHelper from '../../../../app/src/Features/Helpers/EmailHelper.mjs'

// "Report a problem" first shows the student what the report will hold: the
// page they were on, the version of the platform and their browser. They can
// leave the page out, then their email app opens a message to the admin
// address (OVERLEAF_ADMIN_EMAIL) with those details filled in, which they can
// still change before sending.

// Control characters, including tabs, and the Unicode line separators
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g

// Values come from the browser: one line, limited length
function cleanText(text, max) {
  return typeof text === 'string'
    ? text.replace(CONTROL_CHARS, ' ').trim().slice(0, max)
    : ''
}

// Only the path of a page on this site is kept. Query strings and fragments
// can carry tokens (password resets), so they never leave the platform.
function cleanPage(page) {
  if (
    typeof page !== 'string' ||
    !page.startsWith('/') ||
    page.startsWith('//')
  ) {
    return ''
  }
  return cleanText(page.split(/[?#]/)[0], 200)
}

function supportAddress() {
  const address = EmailHelper.parseEmail(Settings.adminEmail)
  return address === 'placeholder@example.com' ? null : address
}

// The page a footer or error-page link was clicked on, if it is on this site.
// Links that know their page pass ?page= instead.
function refererPath(referer) {
  try {
    const url = new URL(referer)
    return url.origin === new URL(Settings.siteUrl).origin ? url.pathname : ''
  } catch {
    return ''
  }
}

// Shared by the preview and the email, so the student sends what they saw
async function reportDetails(req, page) {
  // a report without the version is still worth sending
  const archive = await SourceCode.getArchive().catch(() => null)
  return {
    page: page ? Settings.siteUrl.replace(/\/$/, '') + page : '',
    version: archive ? archive.revision.slice(0, 12) : 'unknown',
    browser: cleanText(req.headers['user-agent'], 300) || 'unknown',
  }
}

// Open to logged-out users: someone who cannot log in needs it most
async function showReport(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const page = cleanPage(
    typeof req.query.page === 'string'
      ? req.query.page
      : refererPath(req.headers.referer)
  )
  res.render(Path.resolve(import.meta.dirname, '../views/report-problem'), {
    page,
    email: supportAddress(),
    details: await reportDetails(req, page),
  })
}

const MAX_MAILTO_LENGTH = 1900

async function sendReport(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const email = supportAddress()
  if (!email) {
    res.status(503)
    return showReport(req, res)
  }
  const page = req.query.include_page ? cleanPage(req.query.page) : ''
  const details = await reportDetails(req, page)
  // RFC 6068: line breaks in a mailto body are CRLF
  const link = details => {
    const body = [
      'What went wrong, and what were you doing when it happened?',
      '',
      '',
      '---',
      ...(details.page ? [`page: ${details.page}`] : []),
      `version: ${details.version}`,
      `browser: ${details.browser}`,
    ].join('\r\n')
    const query = new URLSearchParams({
      subject: `${Settings.appName}: problem report`,
      body,
    })
    // mail clients read "+" literally, so spaces must be %20
    return `mailto:${encodeURIComponent(email).replace('%40', '@')}?${query.toString().replace(/\+/g, '%20')}`
  }
  // Mail clients and phones refuse very long links, so an over-long one leaves
  // out the browser, the longest part. The preview still shows everything.
  const full = link(details)
  res.redirect(
    full.length <= MAX_MAILTO_LENGTH
      ? full
      : link({ ...details, browser: 'unknown' })
  )
}

export default {
  showReport: expressify(showReport),
  sendReport: expressify(sendReport),
}
