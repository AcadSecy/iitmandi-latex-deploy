import { expect, describe, it, beforeEach, afterEach } from 'vitest'
import Path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { detectEngine, chooseCompiler } from '../../../app/js/EngineDetector.js'

const doc = (preamble, body = 'Hello') =>
  `\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`

describe('EngineDetector', () => {
  describe('detectEngine', () => {
    it('leaves a plain pdfLaTeX document alone', () => {
      expect(detectEngine(doc('\\usepackage{graphicx}\n\\usepackage[T1]{fontenc}'))).toBe(null)
    })

    it('picks XeLaTeX for fontspec, polyglossia and unicode-math, and names the package', () => {
      expect(detectEngine(doc('\\usepackage{fontspec}'))).toEqual({ engine: 'xelatex', reason: 'fontspec' })
      expect(detectEngine(doc('\\usepackage[english]{polyglossia}'))).toEqual({ engine: 'xelatex', reason: 'polyglossia' })
      expect(detectEngine(doc('\\usepackage{amsmath,unicode-math}'))).toEqual({ engine: 'xelatex', reason: 'unicode-math' })
      expect(detectEngine(doc('\\RequirePackage { fontspec }'))).toEqual({ engine: 'xelatex', reason: 'fontspec' })
    })

    it('picks LuaLaTeX for Lua code', () => {
      expect(detectEngine(doc('\\usepackage{luacode}'))).toEqual({ engine: 'lualatex', reason: 'luacode' })
      expect(detectEngine(doc('\\directlua{tex.print("x")}'))).toEqual({ engine: 'lualatex', reason: '\\directlua' })
    })

    it('ignores packages that are commented out', () => {
      expect(detectEngine(doc('% \\usepackage{fontspec}'))).toBe(null)
      expect(detectEngine(doc('\\usepackage{graphicx} % \\usepackage{fontspec}'))).toBe(null)
    })

    it('ignores the word fontspec after the preamble', () => {
      expect(detectEngine(doc('', 'We do not \\usepackage{fontspec} here.'))).toBe(null)
    })

    it('follows a magic comment', () => {
      expect(detectEngine(`% !TEX program = lualatex\n${doc('')}`)).toEqual({ engine: 'lualatex', reason: 'magic-comment' })
      expect(detectEngine(`%!TEX TS-program = XeLaTeX\n${doc('')}`)).toEqual({ engine: 'xelatex', reason: 'magic-comment' })
      expect(detectEngine(`% !TEX program = pdflatex\n${doc('\\usepackage{fontspec}')}`)).toEqual({ engine: 'pdflatex', reason: 'magic-comment' })
      expect(detectEngine(`% !TEX program = word\n${doc('')}`)).toBe(null)
    })
  })

  describe('chooseCompiler', () => {
    beforeEach(ctx => {
      ctx.dir = fs.mkdtempSync(Path.join(os.tmpdir(), 'engine-detector-'))
      ctx.main = Path.join(ctx.dir, 'main.tex')
      fs.writeFileSync(ctx.main, doc('\\usepackage{fontspec}'))
    })

    afterEach(ctx => {
      fs.rmSync(ctx.dir, { recursive: true, force: true })
    })

    it('switches the default pdfLaTeX to the engine the document needs', async ctx => {
      expect(await chooseCompiler(ctx.main, 'pdflatex')).toEqual({ compiler: 'xelatex', reason: 'fontspec' })
    })

    it('keeps a compiler the owner chose', async ctx => {
      expect(await chooseCompiler(ctx.main, 'lualatex')).toEqual({ compiler: 'lualatex' })
      expect(await chooseCompiler(ctx.main, 'latex')).toEqual({ compiler: 'latex' })
    })

    it('keeps pdfLaTeX when the root file cannot be read or is not TeX', async ctx => {
      expect(await chooseCompiler(Path.join(ctx.dir, 'missing.tex'), 'pdflatex')).toEqual({ compiler: 'pdflatex' })
      expect(await chooseCompiler(Path.join(ctx.dir, 'main.Rtex'), 'pdflatex')).toEqual({ compiler: 'pdflatex' })
    })
  })
})
