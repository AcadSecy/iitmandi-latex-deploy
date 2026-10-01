// Stopping and pausing real compiles: latexmk and TeX Live in Docker, with the
// production seccomp profile. Run by the "Compile service" CI job, which
// starts it with DOCKER_RUNNER=true and a TeX Live image; skipped elsewhere.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import Path from 'node:path'
import { promisify } from 'node:util'

const enabled = process.env.DOCKER_RUNNER === 'true'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Every page keeps TeX busy for a while, so the compile runs far longer than
// its time limit. (A \loop inside a group can be nested in another \loop.)
const SLOW_DOCUMENT = String.raw`\documentclass{article}
\newcount\pageno
\newcount\spin
\begin{document}
\loop
\section{Section \the\pageno}
Text of section \the\pageno.
{\spin=0 \loop\advance\spin by 1 \ifnum\spin<2000000 \repeat}
\newpage
\advance\pageno by 1
\ifnum\pageno<1000 \repeat
\end{document}
`

const SHORT_DOCUMENT = String.raw`\documentclass{article}
\begin{document}
Hello.
\end{document}
`

describe.skipIf(!enabled)('compiles in Docker', () => {
  let Settings, LatexRunner
  let runLatex
  let number = 0

  beforeAll(async () => {
    Settings = (await import('@overleaf/settings')).default
    LatexRunner = (await import('../../app/js/LatexRunner.js')).default
    runLatex = promisify(LatexRunner.runLatex)
  })

  afterAll(async () => {
    const DockerRunner = (await import('../../app/js/DockerRunner.mjs'))
      .default
    DockerRunner.stopContainerMonitor()
  })

  async function compileDir(document) {
    number += 1
    const name = `${'0'.repeat(23)}${number}-test`
    const directory = Path.join(Settings.path.compilesDir, name)
    await fs.rm(directory, { recursive: true, force: true })
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(Path.join(directory, 'main.tex'), document)
    return { name, directory }
  }

  function compile({ name, directory }, compiler, timeout) {
    return runLatex(name, {
      directory,
      mainFile: 'main.tex',
      compiler,
      timeout,
      image: Settings.clsi.docker.image,
      environment: {},
      compileGroup: 'standard',
      stats: {},
      timings: {},
    })
  }

  async function errorOf(promise) {
    try {
      await promise
    } catch (error) {
      return error
    }
    throw new Error('expected the compile to fail')
  }

  async function finishedPdf(directory) {
    const pdf = await fs.readFile(Path.join(directory, 'output.pdf'))
    expect(pdf.subarray(-1024).toString('latin1')).toContain('%%EOF')
    const log = await fs.readFile(Path.join(directory, 'output.log'), 'latin1')
    const written = log.match(/Output written on output\.(pdf|xdv) \((\d+) pages?/)
    expect(written).not.toBeNull()
    return { log, pages: Number(written[2]) }
  }

  it('compiles a short document as before', async () => {
    const dir = await compileDir(SHORT_DOCUMENT)
    await compile(dir, 'pdflatex', 60_000)
    const { pages } = await finishedPdf(dir.directory)
    expect(pages).toBe(1)
  }, 120_000)

  // The first XeTeX or LuaTeX run in a new container builds font caches
  // before it typesets anything.
  const TIME_LIMITS = { pdflatex: 15_000, xelatex: 45_000, lualatex: 60_000 }

  for (const [compiler, timeLimit] of Object.entries(TIME_LIMITS)) {
    it(`keeps the pages typeset by ${compiler} when the time is up`, async () => {
      const dir = await compileDir(SLOW_DOCUMENT)
      const error = await errorOf(compile(dir, compiler, timeLimit))
      expect(error.timedout).toBe(true)
      expect(error.stoppedCleanly).toBe(true)

      const { log, pages } = await finishedPdf(dir.directory)
      expect(log).toContain('Interruption')
      expect(pages).toBeGreaterThan(0)
      expect(pages).toBeLessThan(1000)
    }, 180_000)
  }

  it('keeps the pages typeset when the compile is stopped', async () => {
    const dir = await compileDir(SLOW_DOCUMENT)
    const compiling = errorOf(compile(dir, 'pdflatex', 120_000))
    await sleep(10_000)
    await promisify(LatexRunner.killLatex)(dir.name)
    const error = await compiling
    expect(error.terminated).toBe(true)
    expect(error.stoppedCleanly).toBe(true)
    const { pages } = await finishedPdf(dir.directory)
    expect(pages).toBeGreaterThan(0)
  }, 180_000)

  it('does not count the time a compile is paused', async () => {
    const dir = await compileDir(SLOW_DOCUMENT)
    const start = Date.now()
    let finished = false
    const compiling = errorOf(compile(dir, 'pdflatex', 12_000)).finally(() => {
      finished = true
    })
    await sleep(4000)
    await promisify(LatexRunner.suspendLatex)(dir.name)
    await sleep(10_000)
    expect(finished).toBe(false)
    await promisify(LatexRunner.resumeLatex)(dir.name)

    const error = await compiling
    expect(error.timedout).toBe(true)
    expect(error.stoppedCleanly).toBe(true)
    // 12 s of compiling plus 10 s paused
    expect(Date.now() - start).toBeGreaterThanOrEqual(21_000)
    const { pages } = await finishedPdf(dir.directory)
    expect(pages).toBeGreaterThan(0)
  }, 180_000)
})
