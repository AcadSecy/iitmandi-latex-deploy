import logger from '@overleaf/logger'
import Settings from '@overleaf/settings'
import { expressify } from '@overleaf/promise-utils'
import SourceCode from './SourceCode.mjs'

// Sends the source archive of the running version. Range requests and
// conditional requests are handled by res.download.
async function download(req, res, next) {
  const archive = await SourceCode.getArchive()
  if (!archive) {
    logger.error(
      { sourceArchiveDir: Settings.sourceArchiveDir },
      'source archive missing: build the image with server-ce/Makefile'
    )
    res.status(404)
    res.type('text/plain')
    return res.send(
      `The source code archive is missing from this installation. Please tell ${Settings.adminEmail}.`
    )
  }
  res.download(
    archive.path,
    SourceCode.downloadName(archive),
    {
      // the archive only changes with a new image, which restarts the app
      maxAge: 60 * 60 * 1000,
      headers: {
        'Content-Type': 'application/gzip',
        'X-Source-Revision': archive.revision,
      },
    },
    error => {
      if (error && !res.headersSent) {
        next(error)
      }
    }
  )
}

export default {
  download: expressify(download),
}
