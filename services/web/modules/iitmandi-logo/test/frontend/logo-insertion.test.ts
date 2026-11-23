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

  it('moves a cursor after \\end{document} to just before it', function () {
    const withGraphicx = main.replace('amsmath', 'graphicx')
    expect(insertAt(withGraphicx, withGraphicx.length)).to.equal(
      withGraphicx.replace('\\end{document}', `${BLOCK}\n\\end{document}`)
    )
  })

  it('ignores a commented or second \\end{document}', function () {
    const doc =
      '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\nA\\\\% \\end{document}\nB \\\\end{document}\nHello\n\\end{document}\nNotes\n% \\end{document}\n\\end{document}\n'
    expect(insertAt(doc, doc.length)).to.equal(
      doc.replace('Hello\n', `Hello\n${BLOCK}\n`)
    )
  })

  for (const environment of [
    'verbatim',
    'verbatim*',
    'lstlisting',
    'minted',
    'comment',
  ]) {
    it(`ignores \\end{document} inside ${environment}`, function () {
      const language = environment === 'minted' ? '{latex}' : ''
      const doc =
        '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n' +
        `\\begin{${environment}}${language}\n% literal text\n\\end{document}\n\\end{${environment}}\n` +
        'Hello\n\\end{document}\nNotes\n'
      expect(insertAt(doc, doc.length)).to.equal(
        doc.replace('Hello\n', `Hello\n${BLOCK}\n`)
      )
      const cursor = doc.indexOf('Hello')
      expect(insertAt(doc, cursor)).to.equal(
        doc.replace('Hello\n', `${BLOCK}\nHello\n`)
      )
    })
  }

  for (const literal of [
    '\\verb|\\end{document}|',
    '\\verb*+\\end{document}+',
    '\\verb%\\end{document}%',
  ]) {
    it(`ignores the inline literal ${literal}`, function () {
      const doc =
        '\\documentclass{article}\\usepackage{graphicx}\\begin{document}' +
        `${literal}Hello\\end{document}Notes`
      expect(insertAt(doc, doc.length)).to.equal(
        doc.replace('Hello', `Hello\n${BLOCK}\n`)
      )
    })
  }

  it('ignores commented and escaped literal openers', function () {
    const doc =
      '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n' +
      '% \\begin{verbatim}\n\\\\begin{minted}\n% \\verb|\n\\\\verb|\n' +
      'Hello\n\\end{document}\nNotes\n'
    expect(insertAt(doc, doc.length)).to.equal(
      doc.replace('Hello\n', `Hello\n${BLOCK}\n`)
    )
  })

  it('does not clamp the cursor when only literal terminators exist', function () {
    const doc =
      '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n' +
      '\\begin{verbatim}\n\\end{document}\n\\end{verbatim}\nHello\n'
    expect(insertAt(doc, doc.length)).to.equal(`${doc}${BLOCK}\n`)
  })

  it('keeps the logo inside a document written on one line', function () {
    const doc =
      '\\documentclass{article}\\usepackage{graphicx}\\begin{document}Hi\\end{document}'
    expect(insertAt(doc, doc.length)).to.equal(
      doc.replace('Hi', `Hi\n${BLOCK}\n`)
    )
  })

  it('only inserts the logo in a file that is not the main file', function () {
    const chapter = 'Some text\n'
    expect(insertAt(chapter, chapter.length)).to.equal(`Some text\n${BLOCK}\n`)
  })
})
