// Failed, stopped and timed-out compiles through CompileManager, as a compile
// request from the web runs them: which PDF a compile returns and that a
// failed compile leaves the PDF of the last good build alone. Run by the
// "Compile service" CI job, like GracefulStop.test.js; skipped elsewhere.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import Path from 'node:path'

const enabled = process.env.DOCKER_RUNNER === 'true'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// example-image.png ships with TeX Live, so the project needs no binary file
const withImage = image => String.raw`\documentclass{article}
\usepackage{graphicx}
\begin{document}
Page one.
\newpage
Page two.

\includegraphics[width=3cm]{${image}}
\newpage
Page three.
\end{document}
`

// as in GracefulStop.test.js: every page keeps TeX busy for a while
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

describe.skipIf(!enabled)('failed compiles in Docker', () => {
  let Settings, CompileManager, RequestParser
  let number = 0

  beforeAll(async () => {
    Settings = (await import('@overleaf/settings')).default
    CompileManager = (await import('../../app/js/CompileManager.js')).default
    RequestParser = (await import('../../app/js/RequestParser.js')).default
  })

  afterAll(async () => {
    const DockerRunner = (await import('../../app/js/DockerRunner.mjs')).default
    DockerRunner.stopContainerMonitor()
  })

  async function newProject() {
    number += 1
    const projectId = `${'0'.repeat(21)}${number}fail`
    for (const dir of [Settings.path.compilesDir, Settings.path.outputDir]) {
      await fs.rm(Path.join(dir, projectId), { recursive: true, force: true })
    }
    return projectId
  }

  async function request(projectId, compiler, content, timeout = 60) {
    const parsed = await RequestParser.promises.parse({
      compile: {
        options: {
          compiler,
          timeout,
          imageName: Settings.clsi.docker.image,
          compileGroup: 'standard',
        },
        rootResourcePath: 'main.tex',
        resources: [{ path: 'main.tex', content }],
      },
    })
    parsed.project_id = projectId
    return parsed
  }

  // what the web gets back: the output files, and whether there was an error
  async function compile(...args) {
    try {
      const { outputFiles } = await CompileManager.promises.doCompileWithLock(
        await request(...args),
        {},
        {}
      )
      return { outputFiles }
    } catch (error) {
      return { error, outputFiles: error.outputFiles }
    }
  }

  function pdfOf(outputFiles) {
    return outputFiles.find(file => file.path === 'output.pdf')
  }

  // The pages of the PDF the web downloads from the build's output folder.
  // The PDF must be complete; the page count comes from the build's log.
  async function pagesOfPdf(projectId, file) {
    const build = Path.join(
      Settings.path.outputDir,
      projectId,
      'generated-files',
      file.build
    )
    const pdf = await fs.readFile(Path.join(build, 'output.pdf'))
    expect(pdf.subarray(-1024).toString('latin1')).toContain('%%EOF')
    const log = await fs.readFile(Path.join(build, 'output.log'), 'latin1')
    const written = log.match(
      /Output written on output\.(pdf|xdv) \((\d+) pages?/
    )
    expect(written).not.toBeNull()
    return Number(written[2])
  }

  it('returns a valid multi-page PDF, drops the XeLaTeX stub on a missing image and keeps the earlier build', async () => {
    const projectId = await newProject()

    const good = await compile(projectId, 'xelatex', withImage('example-image'))
    expect(good.error).toBeUndefined()
    const goodPdf = pdfOf(good.outputFiles)
    expect(await pagesOfPdf(projectId, goodPdf)).toBe(3)

    const failed = await compile(
      projectId,
      'xelatex',
      withImage('assets/missing.png')
    )
    expect(failed.error).toBeUndefined()
    expect(pdfOf(failed.outputFiles)).toBeUndefined()
    expect(failed.outputFiles.map(file => file.path)).toContain('output.log')
    // the PDF of the good build is still there for the editor to show
    expect(await pagesOfPdf(projectId, goodPdf)).toBe(3)

    const fixed = await compile(
      projectId,
      'xelatex',
      withImage('example-image')
    )
    expect(await pagesOfPdf(projectId, pdfOf(fixed.outputFiles))).toBe(3)
  }, 240_000)

  it('returns no PDF on the first compile of a project with a missing image', async () => {
    const { error, outputFiles } = await compile(
      await newProject(),
      'xelatex',
      withImage('assets/missing.png')
    )
    expect(error).toBeUndefined()
    expect(pdfOf(outputFiles)).toBeUndefined()
  }, 120_000)

  // pdfLaTeX and LuaLaTeX put a placeholder box where the image goes
  for (const compiler of ['pdflatex', 'lualatex']) {
    it(`keeps the readable PDF ${compiler} writes around a missing image`, async () => {
      const projectId = await newProject()
      const { outputFiles } = await compile(
        projectId,
        compiler,
        withImage('assets/missing.png')
      )
      expect(await pagesOfPdf(projectId, pdfOf(outputFiles))).toBe(3)
    }, 180_000)
  }

  it('keeps the pages typeset when the time is up', async () => {
    const projectId = await newProject()
    const { error, outputFiles } = await compile(
      projectId,
      'pdflatex',
      SLOW_DOCUMENT,
      15
    )
    expect(error.timedout).toBe(true)
    expect(error.stoppedCleanly).toBe(true)
    const pages = await pagesOfPdf(projectId, pdfOf(outputFiles))
    expect(pages).toBeGreaterThan(0)
    expect(pages).toBeLessThan(1000)
  }, 180_000)

  it('keeps the pages typeset when the compile is stopped', async () => {
    const projectId = await newProject()
    const compiling = compile(projectId, 'pdflatex', SLOW_DOCUMENT, 120)
    await sleep(10_000)
    await CompileManager.promises.stopCompile(projectId)
    const { error, outputFiles } = await compiling
    expect(error.terminated).toBe(true)
    expect(error.stoppedCleanly).toBe(true)
    const pages = await pagesOfPdf(projectId, pdfOf(outputFiles))
    expect(pages).toBeGreaterThan(0)
  }, 180_000)
})
