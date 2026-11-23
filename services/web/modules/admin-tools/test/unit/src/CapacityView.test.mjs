import { expect, it, vi } from 'vitest'
import path from 'node:path'
import pug from 'pug'
import globby from 'globby'

it('precompiles admin entrypoints with unique app metadata and excludes content partials', async () => {
  vi.doMock('@overleaf/settings', () => ({
    default: { viewIncludes: {}, debugPugTemplates: false },
  }))
  const Views = (
    await import('../../../../../app/src/infrastructure/Views.mjs')
  ).default
  // Same entrypoint selection used by the image's Views precompile step.
  const files = globby.sync('modules/admin-tools/app/views/**/*.pug', {
    onlyFiles: true,
    concurrency: 1,
    ignore: ['**/_*.pug', '**/_*/**'],
  })
  expect(files.some(file => path.basename(file) === 'capacity.pug')).toEqual(
    true
  )
  expect(
    files.some(file => path.basename(file) === '_capacity-content.pug')
  ).toEqual(false)
  for (const file of files) {
    const compiled = pug.compileFileClient(file, Views.PUG_COMPILE_ARGUMENTS)
    const meta = Views._findAllMetaTags(compiled)
    expect(meta.found.length, file).toBeGreaterThan(0)
    expect(meta.duplicates, file).toEqual([])
  }
})
