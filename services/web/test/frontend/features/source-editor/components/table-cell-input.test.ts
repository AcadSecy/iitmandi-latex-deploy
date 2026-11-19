import { expect } from 'chai'
import { filterTableCellInput } from '../../../../../frontend/js/features/source-editor/components/table-generator/utils'

describe('table cell input', function () {
  for (const [input, expected] of [
    ['', ''],
    ['&', String.raw`\&`],
    ['%', String.raw`\%`],
    ['a&&b%%c', String.raw`a\&\&b\%\%c`],
    [String.raw`a\&\%b`, String.raw`a\&\%b`],
    [String.raw`a\\&b`, String.raw`a\&b`],
    [String.raw`a\\\&b`, String.raw`a\&b`],
    [String.raw`a\\\\%%b`, String.raw`a\%\%b`],
    [String.raw`first\\second`, 'firstsecond'],
    [
      String.raw`$x_1$ \unit{kg} \ref{fig_a} x\_1`,
      String.raw`$x_1$ \unit{kg} \ref{fig_a} x\_1`,
    ],
    ['plain_x_1', 'plain_x_1'],
    ['हिंदी & 50%', String.raw`हिंदी \& 50\%`],
  ]) {
    it(`filters ${JSON.stringify(input)} without rewriting LaTeX commands or underscores`, function () {
      const { content, offsets } = filterTableCellInput(input)
      expect(content).to.equal(expected)
      expect(offsets).to.have.length(input.length + 1)
      expect(offsets.at(-1)).to.equal(content.length)
      expect(filterTableCellInput(content).content).to.equal(content)
    })
  }

  it('maps a caret and selection across inserted escapes', function () {
    const { content, offsets } = filterTableCellInput('a&&b')
    expect(content).to.equal(String.raw`a\&\&b`)
    expect(offsets).to.deep.equal([0, 1, 3, 5, 6])
    expect(content.slice(offsets[1], offsets[3])).to.equal(String.raw`\&\&`)
  })

  it('maps both sides and the middle of a removed row separator', function () {
    const { content, offsets } = filterTableCellInput(String.raw`a\\&b`)
    expect(content).to.equal(String.raw`a\&b`)
    expect(offsets).to.deep.equal([0, 1, 1, 1, 3, 4])
  })

  it('keeps offsets for already escaped text and UTF-16 selections', function () {
    const input = String.raw`😀\&x`
    const { content, offsets } = filterTableCellInput(input)
    expect(content).to.equal(input)
    expect(offsets).to.deep.equal([0, 1, 2, 3, 4, 5])
  })
})
