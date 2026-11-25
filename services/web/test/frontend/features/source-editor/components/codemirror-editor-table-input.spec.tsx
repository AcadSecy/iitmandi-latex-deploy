import { EditorView } from '@codemirror/view'
import {
  EditorProviders,
  makeEditorPropertiesProvider,
} from '../../../helpers/editor-providers'
import CodemirrorEditor from '../../../../../frontend/js/features/source-editor/components/codemirror-editor'
import { mockScope } from '../helpers/mock-scope'
import { TestContainer } from '../helpers/test-container'

const SOURCE = String.raw`
\begin{tabular}{cc}
alpha&beta\\
gamma&delta\\
\end{tabular}
`

function mountEditor(content = SOURCE) {
  const scope = mockScope(content)
  cy.mount(
    <TestContainer style={{ width: '100%', height: 750 }}>
      <EditorProviders
        scope={scope}
        providers={{
          EditorPropertiesProvider: makeEditorPropertiesProvider({
            showVisual: true,
            showSymbolPalette: false,
          }),
        }}
      >
        <CodemirrorEditor />
      </EditorProviders>
    </TestContainer>
  )
  cy.get('.cm-content').should('have.css', 'opacity', '1')
  cy.get('.table-generator-cell').should('exist')
}

function source() {
  return cy.get('.cm-editor').then(elements => {
    const view = EditorView.findFromDOM(elements[0])
    expect(view).not.to.equal(null)
    return view!.state.doc.toString()
  })
}

function paste(text: string) {
  const clipboardData = new DataTransfer()
  clipboardData.setData('text/plain', text)
  cy.get('.table-generator-cell')
    .first()
    .click()
    .trigger('paste', { clipboardData })
}

describe('<CodeMirrorEditor/> table cell input', function () {
  beforeEach(function () {
    cy.viewport(1000, 800)
    cy.interceptEvents()
    cy.interceptMathJax()
    cy.interceptCompile({ prefix: 'compile', times: Number.MAX_SAFE_INTEGER })
    cy.intercept('/project/*/doc/*/metadata', { body: {} })
    window.metaAttributesCache.set('ol-preventCompileOnLoad', true)
  })

  for (const char of ['&', '%']) {
    it(`escapes ${char} when it starts editing`, function () {
      mountEditor()
      cy.get('.table-generator-cell').first().type(`${char}{enter}`)
      source().should('equal', SOURCE.replace('alpha', `\\${char}`))
    })
  }

  it('filters a single pasted input event, including adjacent characters and row separators', function () {
    mountEditor()
    cy.get('.table-generator-cell').first().dblclick()
    cy.get('textarea.table-generator-cell-input')
      .invoke('val', String.raw`a&&b%%c\\&d\&e`)
      .trigger('input', { inputType: 'insertFromPaste' })
      .type('{enter}')
    source().should(
      'equal',
      SOURCE.replace('alpha', String.raw`a\&\&b\%\%c\&d\&e`)
    )
  })

  it('filters tab-separated paste onto a selected cell without adding columns or comments', function () {
    mountEditor()
    paste('a&&b\t50%%\r\n$x_1$\t\\unit{kg}')
    cy.get('.table-generator-cell').should('have.length', 4)
    source().should(
      'equal',
      SOURCE.replace('alpha', String.raw`a\&\&b`)
        .replace('beta', String.raw`50\%\%`)
        .replace('gamma', '$x_1$')
        .replace('delta', String.raw`\unit{kg}`)
    )
  })

  it('keeps the caret in the middle after inserting an escape', function () {
    mountEditor(SOURCE.replace('alpha', 'ab'))
    cy.get('.table-generator-cell').first().dblclick()
    cy.get('textarea.table-generator-cell-input')
      .type('{home}{rightarrow}&c')
      .should('have.value', String.raw`a\&cb`)
      .then(elements =>
        expect((elements[0] as HTMLTextAreaElement).selectionStart).to.equal(4)
      )
    cy.screenshot('issue44-caret-in-middle')
    cy.get('textarea.table-generator-cell-input').type('{enter}')
    source().should('equal', SOURCE.replace('alpha', String.raw`a\&cb`))
  })

  it('keeps replacement typing at the selected position', function () {
    mountEditor(SOURCE.replace('alpha', 'abcd'))
    cy.get('.table-generator-cell').first().dblclick()
    cy.get('textarea.table-generator-cell-input')
      .then(elements => {
        ;(elements[0] as HTMLTextAreaElement).setSelectionRange(1, 3)
      })
      .type('&&')
      .should('have.value', String.raw`a\&\&d`)
  })

  it('preserves source through undo, redo and an editor remount at phone width', function () {
    cy.viewport(390, 844)
    mountEditor()
    paste('a&b')
    const expected = SOURCE.replace('alpha', String.raw`a\&b`)
    source().should('equal', expected)
    cy.get('.table-generator-cell')
      .first()
      .trigger('keydown', { key: 'z', ctrlKey: true })
    source().should('equal', SOURCE)
    cy.get('.table-generator-cell')
      .first()
      .trigger('keydown', { key: 'y', ctrlKey: true })
    source().should('equal', expected)
    source().then(saved => mountEditor(saved))
    source().should('equal', expected)
    cy.get('.table-generator-cell').should('have.length', 4)
    cy.screenshot('issue44-phone-remount')
  })

  it('preserves booktabs, multicolumn, math and custom macros while editing one cell', function () {
    const complex = String.raw`
\documentclass{article}
\usepackage{booktabs}
\newcommand{\unit}[1]{#1}
\begin{document}
\begin{tabular}{@{}p{3cm}c@{}}
\toprule
alpha&\unit{kg}\\
\multicolumn{2}{c}{$x_1$}\\
\bottomrule
\end{tabular}
\end{document}
`
    mountEditor(complex)
    paste('a&&b%%c')
    source().should('equal', complex.replace('alpha', String.raw`a\&\&b\%\%c`))
    source().then(saved =>
      cy.writeFile('/tmp/latex-table-output-44.tex', saved)
    )
    cy.screenshot('issue44-table-input')
  })
})
