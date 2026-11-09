import Path from 'node:path'
import Settings from '@overleaf/settings'
import { expressify } from '@overleaf/promise-utils'
import SourceCode from '../../../source-code/app/src/SourceCode.mjs'

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
  const page = cleanPage(
    typeof req.query.page === 'string'
      ? req.query.page
      : refererPath(req.headers.referer)
  )
  res.render(Path.resolve(import.meta.dirname, '../views/report-problem'), {
    page,
    details: await reportDetails(req, page),
  })
}

async function sendReport(req, res) {
  const page = req.query.include_page ? cleanPage(req.query.page) : ''
  const details = await reportDetails(req, page)
  const body = [
    'What went wrong, and what were you doing when it happened?',
    '',
    '',
    '---',
    ...(details.page ? [`page: ${details.page}`] : []),
    `version: ${details.version}`,
    `browser: ${details.browser}`,
  ].join('\n')
  const query = new URLSearchParams({
    subject: `${Settings.appName}: problem report`,
    body,
  })
  // mail clients read "+" literally, so spaces must be %20
  res.redirect(
    `mailto:${Settings.adminEmail}?${query.toString().replace(/\+/g, '%20')}`
  )
}

export default {
  showReport: expressify(showReport),
  sendReport: expressify(sendReport),
}
