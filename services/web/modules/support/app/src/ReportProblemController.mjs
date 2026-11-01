import Settings from '@overleaf/settings'
import { expressify } from '@overleaf/promise-utils'
import SourceCode from '../../../source-code/app/src/SourceCode.mjs'

// "Report a problem" opens the student's email app with a message to support
// (OVERLEAF_SUPPORT_EMAIL, or OVERLEAF_ADMIN_EMAIL when that is not set) that
// already holds the page they were on, the version of the platform and their
// browser, so a report is useful without a back-and-forth. The student sees
// all of it and can change it before sending.

// Only the path of the page is kept. Query strings and fragments can carry
// tokens (password resets), so they never leave the platform.
function cleanPage(page) {
  if (
    typeof page !== 'string' ||
    !page.startsWith('/') ||
    page.startsWith('//')
  ) {
    return ''
  }
  return page.split(/[?#]/)[0].slice(0, 200)
}

// Header values come from the browser: one line, limited length
function cleanText(text, max) {
  return typeof text === 'string'
    ? text.replace(/[\r\n]+/g, ' ').slice(0, max)
    : ''
}

// The page a footer link was clicked on. Links that know their page pass
// ?page= instead.
function refererPath(referer) {
  try {
    return new URL(referer).pathname
  } catch {
    return ''
  }
}

// Open to logged-out users: someone who cannot log in needs it most
async function reportProblem(req, res) {
  // a report without the version is still worth sending
  const archive = await SourceCode.getArchive().catch(() => null)
  const page = cleanPage(
    typeof req.query.page === 'string'
      ? req.query.page
      : refererPath(req.headers.referer)
  )
  const details = {
    page: page ? Settings.siteUrl.replace(/\/$/, '') + page : 'unknown',
    version: archive ? archive.revision.slice(0, 12) : 'unknown',
    browser: cleanText(req.headers['user-agent'], 300) || 'unknown',
  }
  const body = [
    'What went wrong, and what were you doing when it happened?',
    '',
    '',
    '---',
    ...Object.entries(details).map(([key, value]) => `${key}: ${value}`),
  ].join('\n')
  const query = new URLSearchParams({
    subject: `${Settings.appName}: problem report`,
    body,
  })
  // mail clients read "+" literally, so spaces must be %20
  res.redirect(
    `mailto:${supportEmail()}?${query.toString().replace(/\+/g, '%20')}`
  )
}

function supportEmail() {
  return Settings.supportEmail || Settings.adminEmail
}

// For the editor's dialog, which shows the address to people without an
// email app. Meta tags cannot come from a module (Views.mjs), so it asks.
function supportAddress(req, res) {
  res.json({ email: supportEmail() })
}

export default {
  reportProblem: expressify(reportProblem),
  supportAddress,
}
