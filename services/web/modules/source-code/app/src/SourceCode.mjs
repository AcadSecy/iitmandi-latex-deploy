// The source code of the running version, for the AGPL-3.0: everyone who uses
// the platform over the network must be able to get it. The image build
// (server-ce/Makefile, `make source-archive`) packs the commit it builds into
// `source.tar.gz` and writes the commit to `REVISION`, both in
// Settings.sourceArchiveDir.
import fs from 'node:fs/promises'
import Path from 'node:path'
import Settings from '@overleaf/settings'

let cached = null

/**
 * @typedef {Object} SourceArchive
 * @property {string} path
 * @property {string} revision the commit the archive and the image were built from
 * @property {number} size in bytes
 */

/**
 * The source archive of this installation, or null when the image was built
 * without one. The archive does not change while the app runs, so a found
 * archive is remembered.
 *
 * @returns {Promise<SourceArchive | null>}
 */
async function getArchive() {
  if (cached) {
    return cached
  }
  const dir = Settings.sourceArchiveDir
  if (!dir) {
    return null
  }
  const path = Path.join(dir, 'source.tar.gz')
  try {
    const [stats, revision] = await Promise.all([
      fs.stat(path),
      fs.readFile(Path.join(dir, 'REVISION'), 'utf8'),
    ])
    if (!stats.isFile() || !/^[0-9a-f]{40}$/.test(revision.trim())) {
      return null
    }
    cached = { path, revision: revision.trim(), size: stats.size }
    return cached
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

// The name users get the archive under, e.g. iitmandi-latex-1a2b3c4d5e6f.tar.gz
function downloadName(archive) {
  return `iitmandi-latex-${archive.revision.slice(0, 12)}.tar.gz`
}

export default {
  getArchive,
  downloadName,
  _resetForTests() {
    cached = null
  },
}
