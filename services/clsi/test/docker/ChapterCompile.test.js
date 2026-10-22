// Compiling one chapter with latexmk -pretex in real Docker compiles. Run by
// the "Compile service" CI job, like GracefulStop.test.js; skipped elsewhere.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import Path from 'node:path'
import { promisify } from 'node:util'

const enabled = process.env.DOCKER_RUNNER === 'true'

const chapter = name => String.raw`\chapter{${name}}\label{ch:${name}}
Text of ${name}, see chapter~\ref{ch:one}.
`

const PROJECT = {
  'main.tex': String.raw`\documentclass{report}
\begin{document}
\include{chapters/one}
\include{chapters/my two}
\include{three}
\end{document}
`,
  'own-includeonly.tex': String.raw`\documentclass{report}
\includeonly{chapters/one}
\begin{document}
\include{chapters/one}
\include{chapters/my two}
\include{three}
\end{document}
`,
  'chapters/one.tex': chapter('one'),
  'chapters/my two.tex': chapter('two'),
  'three.tex': chapter('three'),
}

const CHAPTER_FILES = {
  one: 'chapters/one.tex',
  'my two': 'chapters/my two.tex',
  three: 'three.tex',
}

describe.skipIf(!enabled)('chapter compiles in Docker', () => {
  let Settings, LatexRunner
  let runLatex
  let dir

  beforeAll(async () => {
    Settings = (await import('@overleaf/settings')).default
    LatexRunner = (await import('../../app/js/LatexRunner.js')).default
    runLatex = promisify(LatexRunner.runLatex)

    const name = `${'0'.repeat(22)}99-chapter`
    const directory = Path.join(Settings.path.compilesDir, name)
    await fs.rm(directory, { recursive: true, force: true })
    for (const [path, content] of Object.entries(PROJECT)) {
      await fs.mkdir(Path.dirname(Path.join(directory, path)), {
        recursive: true,
      })
      await fs.writeFile(Path.join(directory, path), content)
    }
    dir = { name, directory }
  })

  afterAll(async () => {
    const DockerRunner = (await import('../../app/js/DockerRunner.mjs')).default
    DockerRunner.stopContainerMonitor()
  })

  // the chapters in the PDF, read from the log
  async function compile(options = {}) {
    await runLatex(dir.name, {
      directory: dir.directory,
      mainFile: 'main.tex',
      compiler: 'pdflatex',
      timeout: 60_000,
      image: Settings.clsi.docker.image,
      environment: {},
      compileGroup: 'standard',
      stats: {},
      timings: {},
      ...options,
    })
    const log = await fs.readFile(
      Path.join(dir.directory, 'output.log'),
      'latin1'
    )
    const pdf = await fs.readFile(Path.join(dir.directory, 'output.pdf'))
    expect(pdf.subarray(-1024).toString('latin1')).toContain('%%EOF')
    return {
      log,
      chapters: Object.keys(CHAPTER_FILES).filter(name =>
        log.includes(`(./${CHAPTER_FILES[name]}`)
      ),
    }
  }

  it('compiles every chapter in a normal compile', async () => {
    expect((await compile()).chapters).toEqual(['one', 'my two', 'three'])
  }, 120_000)

  // forceRebuild: CompileManager asks for it whenever the chapter changes
  it('compiles only the chosen chapter, with numbers from the last full compile', async () => {
    const { chapters } = await compile({
      includeOnly: 'three',
      forceRebuild: true,
    })
    expect(chapters).toEqual(['three'])
    const aux = await fs.readFile(Path.join(dir.directory, 'three.aux'), 'utf8')
    expect(aux).toContain('{ch:three}{{3}')
  }, 120_000)

  it('compiles a chapter whose name has a space', async () => {
    const { chapters } = await compile({
      includeOnly: 'chapters/my two',
      forceRebuild: true,
    })
    expect(chapters).toEqual(['my two'])
  }, 120_000)

  it('picks up an edit when the same chapter compiles again without -g', async () => {
    await fs.appendFile(
      Path.join(dir.directory, 'chapters/my two.tex'),
      '\\typeout{edited chapter two}\n'
    )
    const { chapters, log } = await compile({ includeOnly: 'chapters/my two' })
    expect(chapters).toEqual(['my two'])
    expect(log).toContain('edited chapter two')
  }, 120_000)

  it('compiles everything again after a chapter compile', async () => {
    const { chapters } = await compile({ forceRebuild: true })
    expect(chapters).toEqual(['one', 'my two', 'three'])
  }, 120_000)

  it('lets the chosen chapter win over an \\includeonly in the preamble', async () => {
    const { chapters, log } = await compile({
      mainFile: 'own-includeonly.tex',
      includeOnly: 'three',
      forceRebuild: true,
    })
    expect(chapters).toEqual(['three'])
    expect(log).not.toMatch(/^! /m)
  }, 120_000)
})
