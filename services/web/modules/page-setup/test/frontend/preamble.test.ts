import { expect } from 'chai'
import {
  applyPageSetup,
  documentBodyStart,
  ensurePackage,
  hasPageSetup,
  lineChanges,
  maskComments,
  readPageSetup,
  splitList,
} from '../../frontend/js/preamble'

const BODY = '\\begin{document}\nHello\n\\end{document}\n'

function doc(preamble: string) {
  return `${preamble}\n${BODY}`
}

function applyChanges(
  text: string,
  changes: { from: number; to: number; insert: string }[]
) {
  // apply from the end so that earlier offsets stay valid
  for (const change of [...changes].sort((a, b) => b.from - a.from)) {
    text = text.slice(0, change.from) + change.insert + text.slice(change.to)
  }
  return text
}

describe('Page setup preamble', function () {
  describe('maskComments', function () {
    it('blanks comments and keeps offsets', function () {
      const text = 'a % comment\n\\% kept % gone'
      const masked = maskComments(text)
      expect(masked).to.have.length(text.length)
      expect(masked).to.equal('a          \n\\% kept       ')
    })
  })

  describe('splitList', function () {
    it('splits at top-level commas only', function () {
      expect(splitList(' a4paper, margin={1in,2in} ,12pt,')).to.deep.equal([
        'a4paper',
        'margin={1in,2in}',
        '12pt',
      ])
    })
  })

  describe('hasPageSetup', function () {
    it('leaves slides and posters alone', function () {
      expect(hasPageSetup('article')).to.equal(true)
      expect(hasPageSetup('iitmandi-thesis')).to.equal(true)
      expect(hasPageSetup('beamer')).to.equal(false)
      expect(hasPageSetup('tikzposter')).to.equal(false)
    })
  })

  describe('readPageSetup', function () {
    it('is null for a file that is not a main file', function () {
      expect(readPageSetup('\\section{Intro}\nText')).to.equal(null)
      expect(readPageSetup('\\chapter{One}\n\\begin{document}')).to.equal(null)
    })

    it('reports the class defaults when nothing is set', function () {
      const info = readPageSetup(doc('\\documentclass{article}'))
      expect(info).to.deep.equal({
        documentClass: 'article',
        setup: {
          fontSize: null,
          paper: null,
          margin: null,
          spacing: null,
          font: null,
        },
        fontEditable: true,
      })
    })

    it('reads class options, geometry and spacing', function () {
      const info = readPageSetup(
        doc(
          [
            '\\documentclass[12pt, a4paper]{report}',
            '\\usepackage[margin=2.5cm]{geometry}',
            '\\usepackage{setspace}',
            '\\doublespacing',
            '\\usepackage{mathptmx}',
          ].join('\n')
        )
      )
      expect(info?.setup).to.deep.equal({
        fontSize: '12pt',
        paper: 'a4paper',
        margin: '2.5cm',
        spacing: 'double',
        font: 'times',
      })
    })

    it('ignores commented-out settings', function () {
      const info = readPageSetup(
        doc(
          [
            '% \\documentclass[12pt]{book}',
            '\\documentclass{article} % [11pt]',
            '%\\doublespacing',
          ].join('\n')
        )
      )
      expect(info?.documentClass).to.equal('article')
      expect(info?.setup.fontSize).to.equal(null)
      expect(info?.setup.spacing).to.equal(null)
    })

    it('treats equal sides as one margin and different ones as custom', function () {
      const even = readPageSetup(
        doc(
          '\\documentclass{article}\n\\usepackage[left=2cm,right=2cm,top=2cm,bottom=2cm]{geometry}'
        )
      )
      expect(even?.setup.margin).to.equal('2cm')
      const uneven = readPageSetup(
        doc(
          '\\documentclass{article}\n\\usepackage[letterpaper,top=2cm,bottom=2cm,left=3cm,right=3cm,marginparwidth=1.75cm]{geometry}'
        )
      )
      expect(uneven?.setup.margin).to.equal('custom')
      expect(uneven?.setup.paper).to.equal('letterpaper')
    })

    it('reads spacing from setspace options, \\linespread and \\setstretch', function () {
      const read = (preamble: string) =>
        readPageSetup(doc(`\\documentclass{article}\n${preamble}`))?.setup
          .spacing
      expect(read('\\usepackage[onehalfspacing]{setspace}')).to.equal('onehalf')
      expect(read('\\linespread{1.6}')).to.equal('custom')
      expect(read('\\usepackage{setspace}\\setstretch{1}')).to.equal('single')
      expect(read('\\renewcommand{\\baselinestretch}{1.5}')).to.equal('custom')
    })

    it('does not offer to change fonts set with fontspec', function () {
      const info = readPageSetup(
        doc(
          '\\documentclass{article}\n\\usepackage{fontspec}\n\\setmainfont{Arial}'
        )
      )
      expect(info?.setup.font).to.equal('custom')
      expect(info?.fontEditable).to.equal(false)
    })

    it('recognises the sans-serif Helvetica setup', function () {
      const info = readPageSetup(
        doc(
          '\\documentclass{article}\n\\usepackage[scaled]{helvet}\n\\renewcommand\\familydefault{\\sfdefault}'
        )
      )
      expect(info?.setup.font).to.equal('helvetica')
    })
  })

  describe('applyPageSetup', function () {
    it('changes line spacing from single to double', function () {
      const before = doc(
        '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{setspace}\n\\singlespacing\n\\usepackage{hyperref}'
      )
      const after = applyPageSetup(before, { spacing: 'double' })
      expect(after).to.equal(
        doc(
          '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{setspace}\n\\doublespacing\n\\usepackage{hyperref}'
        )
      )
      expect(readPageSetup(after)?.setup.spacing).to.equal('double')
    })

    it('loads setspace when it is missing', function () {
      const after = applyPageSetup(
        doc('\\documentclass{article}\n\\usepackage{amsmath}\n\\title{T}'),
        { spacing: 'onehalf' }
      )
      expect(after).to.equal(
        doc(
          '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{setspace}\n\\onehalfspacing\n\\title{T}'
        )
      )
    })

    it('replaces \\linespread and setspace options', function () {
      const after = applyPageSetup(
        doc(
          '\\documentclass{article}\n\\usepackage[doublespacing]{setspace}\n\\linespread{1.3} % wide'
        ),
        { spacing: 'single' }
      )
      expect(after).to.equal(
        doc('\\documentclass{article}\n\\usepackage{setspace}\n\\singlespacing')
      )
    })

    it('removes the spacing setting for the template default', function () {
      const after = applyPageSetup(
        doc(
          '\\documentclass{article}\n\\usepackage{setspace}\n\\doublespacing'
        ),
        { spacing: null }
      )
      expect(after).to.equal(
        doc('\\documentclass{article}\n\\usepackage{setspace}')
      )
    })

    it('sets font size and paper as class options', function () {
      expect(
        applyPageSetup(doc('\\documentclass{article}'), {
          fontSize: '12pt',
          paper: 'a4paper',
        })
      ).to.equal(doc('\\documentclass[12pt,a4paper]{article}'))
      expect(
        applyPageSetup(doc('\\documentclass[11pt, twocolumn]{article}'), {
          fontSize: '10pt',
        })
      ).to.equal(doc('\\documentclass[twocolumn, 10pt]{article}'))
      expect(
        applyPageSetup(doc('\\documentclass[12pt]{article}'), {
          fontSize: null,
        })
      ).to.equal(doc('\\documentclass{article}'))
    })

    it('moves the paper size out of geometry into the class options', function () {
      const after = applyPageSetup(
        doc(
          '\\documentclass{article}\n\\usepackage[letterpaper,margin=2cm]{geometry}'
        ),
        { paper: 'a4paper' }
      )
      expect(after).to.equal(
        doc(
          '\\documentclass[a4paper]{article}\n\\usepackage[margin=2cm]{geometry}'
        )
      )
    })

    it('adds geometry without options so that it never clashes with the class', function () {
      const after = applyPageSetup(
        doc('\\documentclass{iitmandi-thesis}\n\\usepackage{amsmath}'),
        { margin: '2.5cm' }
      )
      expect(after).to.equal(
        doc(
          '\\documentclass{iitmandi-thesis}\n\\usepackage{amsmath}\n\\usepackage{geometry}\n\\geometry{margin=2.5cm}'
        )
      )
      expect(readPageSetup(after)?.setup.margin).to.equal('2.5cm')
    })

    it('replaces every margin option in an existing geometry', function () {
      const after = applyPageSetup(
        doc(
          '\\documentclass{article}\n\\usepackage[letterpaper,top=2cm,bottom=2cm,left=3cm,right=3cm,marginparwidth=1.75cm]{geometry}'
        ),
        { margin: '1in' }
      )
      expect(after).to.equal(
        doc(
          '\\documentclass{article}\n\\usepackage[letterpaper,margin=1in,marginparwidth=1.75cm]{geometry}'
        )
      )
    })

    it('updates \\geometry when geometry was loaded bare', function () {
      const after = applyPageSetup(
        doc(
          '\\documentclass{article}\n\\usepackage{geometry}\n\\geometry{a4paper}\n\\geometry{left=1cm}'
        ),
        { margin: '2cm' }
      )
      expect(after).to.equal(
        doc(
          '\\documentclass{article}\n\\usepackage{geometry}\n\\geometry{a4paper,margin=2cm}'
        )
      )
    })

    it('keeps new lines next to the commands they belong with', function () {
      const after = applyPageSetup(
        doc('\\documentclass{article}\n\\usepackage{amsmath}\n\\title{T}'),
        { margin: '2cm', spacing: 'double', font: 'times' }
      )
      expect(after).to.equal(
        doc(
          [
            '\\documentclass{article}',
            '\\usepackage{amsmath}',
            '\\usepackage{geometry}',
            '\\geometry{margin=2cm}',
            '\\usepackage{setspace}',
            '\\doublespacing',
            '\\usepackage{mathptmx}',
            '\\title{T}',
          ].join('\n')
        )
      )
    })

    it('removes a geometry left with nothing to do', function () {
      const after = applyPageSetup(
        doc(
          '\\documentclass{article}\n\\usepackage{geometry}\n\\geometry{margin=2cm}\n\\usepackage{amsmath}'
        ),
        { margin: null }
      )
      expect(after).to.equal(
        doc('\\documentclass{article}\n\\usepackage{amsmath}')
      )
    })

    it('switches between Times and Helvetica', function () {
      const times = applyPageSetup(
        doc('\\documentclass{article}\n\\usepackage{amsmath,times}'),
        { font: 'helvetica' }
      )
      expect(times).to.equal(
        doc(
          '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage[scaled=0.92]{helvet}\n\\renewcommand{\\familydefault}{\\sfdefault}'
        )
      )
      expect(readPageSetup(times)?.setup.font).to.equal('helvetica')
      const back = applyPageSetup(times, { font: 'times' })
      expect(back).to.equal(
        doc(
          '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{mathptmx}'
        )
      )
      expect(applyPageSetup(back, { font: null })).to.equal(
        doc('\\documentclass{article}\n\\usepackage{amsmath}')
      )
    })

    it('leaves custom settings alone', function () {
      const before = doc(
        '\\documentclass{article}\n\\usepackage[left=1cm,right=2cm]{geometry}\n\\linespread{1.3}'
      )
      expect(
        applyPageSetup(before, { margin: 'custom', spacing: 'custom' })
      ).to.equal(before)
    })

    it('never touches the document body', function () {
      const before =
        '\\documentclass{article}\n\\begin{document}\n\\doublespacing\n\\geometry{margin=1cm}\n\\end{document}\n'
      const after = applyPageSetup(before, {
        spacing: 'single',
        margin: '2cm',
      })
      expect(after.slice(after.indexOf('\\begin{document}'))).to.equal(
        before.slice(before.indexOf('\\begin{document}'))
      )
    })
  })

  describe('ensurePackage', function () {
    it('loads a missing package after the others', function () {
      expect(
        ensurePackage(
          doc('\\documentclass{article}\n\\usepackage{amsmath}\n\\title{T}'),
          'graphicx',
          ['graphics']
        )
      ).to.equal(
        doc(
          '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{graphicx}\n\\title{T}'
        )
      )
    })

    it('leaves a document that already loads it or an alternative', function () {
      for (const preamble of [
        '\\documentclass{article}\n\\usepackage[draft]{graphicx}',
        '\\documentclass{article}\n\\usepackage{amsmath,graphics}',
      ]) {
        expect(ensurePackage(doc(preamble), 'graphicx', ['graphics'])).to.equal(
          doc(preamble)
        )
      }
    })

    it('leaves files that are not main files', function () {
      expect(ensurePackage('\\section{A}', 'graphicx')).to.equal('\\section{A}')
    })
  })

  describe('documentBodyStart', function () {
    it('finds \\begin{document} outside comments', function () {
      const text =
        '\\documentclass{article}\n% \\begin{document}\n\\begin{document}\nx'
      expect(documentBodyStart(text)).to.equal(text.lastIndexOf('\\begin'))
      expect(documentBodyStart('no body')).to.equal(-1)
    })
  })

  describe('lineChanges', function () {
    it('changes only the lines that differ', function () {
      const before = 'a\nb\nc\nd\n'
      const after = 'a\nB\nc\nx\nd\n'
      const changes = lineChanges(before, after)
      expect(changes).to.deep.equal([
        { from: 2, to: 4, insert: 'B\n' },
        { from: 6, to: 6, insert: 'x\n' },
      ])
      expect(applyChanges(before, changes)).to.equal(after)
    })

    it('handles changes at the end of a text without a final newline', function () {
      for (const [before, after] of [
        ['a\nb', 'a'],
        ['a', 'a\nb'],
        ['a\nb', 'a\nc'],
        ['a\nb\nc', 'b'],
        ['', 'x'],
      ]) {
        expect(applyChanges(before, lineChanges(before, after))).to.equal(after)
      }
    })

    it('round-trips page setup edits', function () {
      const before = doc(
        '\\documentclass[11pt]{article}\n\\usepackage[margin=1in]{geometry}\n\\usepackage{graphicx}\n\\title{Report}'
      )
      const after = applyPageSetup(before, {
        fontSize: '12pt',
        margin: '2cm',
        spacing: 'double',
        font: 'times',
      })
      expect(applyChanges(before, lineChanges(before, after))).to.equal(after)
    })
  })
})
