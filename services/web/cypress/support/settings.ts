import fs from 'node:fs'
import path from 'node:path'

const developerConfig = path.resolve(
  __dirname,
  '../../config/settings.webpack.js'
)

// Fresh checkouts do not have a developer's local settings file.
if (
  process.env.OVERLEAF_CONFIG === developerConfig &&
  !fs.existsSync(developerConfig)
) {
  process.env.OVERLEAF_CONFIG = path.resolve(__dirname, '../settings.js')
}
