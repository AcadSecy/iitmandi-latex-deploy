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
