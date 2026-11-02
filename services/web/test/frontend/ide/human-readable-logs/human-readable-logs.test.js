import { expect } from 'chai'
import HumanReadableLogs from '../../../../frontend/js/ide/human-readable-logs/HumanReadableLogs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { some } from 'lodash'

const fixturePath = '../../helpers/fixtures/logs/'

async function parse(fixtureName) {
  const filePath = join(__dirname, fixturePath, fixtureName)
  const data = await readFile(filePath, 'utf-8', 'r')
  return HumanReadableLogs.parse(data)
}

describe('HumanReadableLogs', function () {
  describe('Missing image', function () {
    before(async function () {
      this.result = await parse('missing-image-xelatex.log')
    })

    it('lists the missing file with its line first', function () {
      expect(this.result.errors[0]).to.include({
        level: 'error',
        line: 6,
        file: './main.tex',
        ruleId: 'hint_file_not_found',
        message:
          "File `assets/deliberately-missing.png' not found on input line 6.",
      })
    })

    it('drops the errors that follow from the missing file', function () {
      expect(this.result.errors).to.have.length(1)
      expect(this.result.warnings).to.have.length(0)
    })
  })

  // The compile-failure-* logs are real TeX Live 2026 logs, compiled with the
  // latexmk arguments CLSI uses.
  describe('Missing image after an unrelated error (XeLaTeX)', function () {
    before(async function () {
      this.result = await parse('compile-failure-png-unrelated-xelatex.log')
    })

    it('keeps the earlier unrelated error first and in place', function () {
      expect(
        this.result.errors.map(error => [error.line, error.message])
      ).to.deep.equal([
        [4, 'Undefined control sequence.'],
        [6, "File `assets/missing.png' not found on input line 6."],
      ])
    })
  })

  describe('Missing included PDF (XeLaTeX)', function () {
    it('lists the missing file with its line as the only error', async function () {
      const result = await parse('compile-failure-pdf-missing-xelatex.log')
      expect(result.errors).to.have.length(1)
      expect(result.errors[0]).to.include({
        line: 6,
        ruleId: 'hint_file_not_found',
        message: "File `assets/missing.pdf' not found on input line 6.",
      })
    })
  })

  describe('Missing included PDF (pdfLaTeX)', function () {
    it('keeps the error pdfLaTeX already reports first', async function () {
      const result = await parse('compile-failure-pdf-missing-pdf.log')
      expect(result.errors).to.have.length(1)
      expect(result.errors[0]).to.include({
        line: 6,
        ruleId: 'hint_file_not_found',
        message:
          "Package pdftex.def Error: File `assets/missing.pdf' not found: using draft setting.",
      })
    })
  })

  describe('Corrupt included PDF', function () {
    it('keeps the errors XeLaTeX reports for the unreadable file', async function () {
      const result = await parse('compile-failure-pdf-corrupt-xelatex.log')
      expect(
        result.errors.map(error => [error.line, error.message])
      ).to.deep.equal([
        [6, "Unable to load picture or PDF file 'assets/bad.pdf'."],
        [6, "Unable to load picture or PDF file 'assets/bad.pdf'."],
      ])
    })

    it('names the file in the fatal pdfLaTeX error', async function () {
      const result = await parse('compile-failure-pdf-corrupt-pdf.log')
      expect(result.errors.map(error => error.message)).to.deep.equal([
        'pdfTeX error: pdflatex (file ./assets/bad.pdf): xpdf: reading PDF image failed',
      ])
    })

    it('names the file in the fatal LuaLaTeX error', async function () {
      const result = await parse('compile-failure-pdf-corrupt-lualatex.log')
      expect(result.errors.map(error => error.message)).to.deep.equal([
        'error:  (file assets/bad.pdf) (pdf inclusion): reading image failed',
      ])
    })
  })

  describe('Undefined commands', function () {
    before(async function () {
      this.errors = (await parse('undefined-control-sequence.log')).errors
    })

    describe('For unknown commands', function () {
      it('Identifies command at beginning of line', function () {
        expect(
          some(this.errors, {
            line: 3,
            level: 'error',
            message: 'Undefined control sequence.',
          })
        ).to.be.true
      })
      it('Identifies command at end of line', function () {
        expect(
          some(this.errors, {
            line: 4,
            level: 'error',
            message: 'Undefined control sequence.',
          })
        ).to.be.true
      })
      it('Identifies command inside argument', function () {
        expect(
          some(this.errors, {
            line: 5,
            level: 'error',
            message: 'Undefined control sequence.',
          })
        ).to.be.true
      })
    })

    describe('For known commands', function () {
      it('Identifies command at beginning of line', function () {
        expect(
          some(this.errors, {
            line: 6,
            level: 'error',
            message: 'Is \\usepackage{url} missing?',
          })
        ).to.be.true
      })
      it('Identifies command at end of line', function () {
        expect(
          some(this.errors, {
            line: 7,
            level: 'error',
            message: 'Is \\usepackage{amsmath} missing?',
          })
        ).to.be.true
      })
      it('Identifies command inside argument', function () {
        expect(
          some(this.errors, {
            line: 8,
            level: 'error',
            message: 'Is \\usepackage{array} missing?',
          })
        ).to.be.true
      })
    })
  })
})
