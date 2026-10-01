import { expect } from 'chai'
import { logoBlock, logoInsertion } from '../../frontend/js/logo-insertion'

const BLOCK = logoBlock('iitmandi-logo.jpg')

function insertAt(doc: string, cursor: number) {
  let text = doc
  const changes = logoInsertion(doc, cursor, 'iitmandi-logo.jpg')
  for (const change of [...changes].sort((a, b) => b.from - a.from)) {
    text = text.slice(0, change.from) + change.insert + text.slice(change.to)
  }
  return text
}

describe('IIT Mandi logo insertion', function () {
  const main =
    '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nHello\n\n\\end{document}\n'

  it('loads graphicx and inserts the logo on an empty line', function () {
    const cursor = main.indexOf('\n\n') + 1
    expect(insertAt(main, cursor)).to.equal(
      `\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{graphicx}\n\\begin{document}\nHello\n${BLOCK}\n\n\\end{document}\n`
    )
  })

  it('puts the logo on lines of its own next to text', function () {
    const withGraphicx = main.replace('amsmath', 'graphicx')
    const end = withGraphicx.indexOf('Hello') + 'Hello'.length
    expect(insertAt(withGraphicx, end)).to.equal(
      withGraphicx.replace('Hello', `Hello\n${BLOCK}`)
    )
    const middle = withGraphicx.indexOf('Hello') + 2
    expect(insertAt(withGraphicx, middle)).to.equal(
      withGraphicx.replace('Hello', `He\n${BLOCK}\nllo`)
    )
  })

  it('moves a cursor in the preamble to the start of the document', function () {
    const withGraphicx = main.replace('amsmath', 'graphicx')
    expect(insertAt(withGraphicx, 0)).to.equal(
      withGraphicx.replace(
        '\\begin{document}\n',
        `\\begin{document}\n${BLOCK}\n`
      )
    )
  })

  it('only inserts the logo in a file that is not the main file', function () {
    const chapter = 'Some text\n'
    expect(insertAt(chapter, chapter.length)).to.equal(`Some text\n${BLOCK}\n`)
  })
})
