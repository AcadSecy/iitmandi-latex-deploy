import { expect } from 'chai'
import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState, EditorSelection, Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { LanguageSupport, ensureSyntaxTree } from '@codemirror/language'
import { LaTeXLanguage } from '@/features/source-editor/languages/latex/latex-language'
import { visual } from '@/features/source-editor/extensions/visual/visual'
import slashInsert from '../../frontend/completions/slash-insert'

function cursorState(
  doc: string,
  cursorPos = doc.length,
  extensions: Extension = []
) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursorPos),
    extensions: [new LanguageSupport(LaTeXLanguage), extensions],
  })
  ensureSyntaxTree(state, doc.length, 1000)
  return state
}

function complete(state: EditorState) {
  return slashInsert(
    new CompletionContext(state, state.selection.main.head, false)
  )
}

describe('slash insert completions', function () {
  it('offers four options after a slash on an otherwise blank line', function () {
    const result = complete(cursorState('hello\n/\nworld', 7))
    expect(result?.from).to.equal(7)
    expect(result?.options.map(option => option.label)).to.deep.equal([
      'Display math',
      'Table',
      'Figure',
      'Citation',
    ])
  })

  it('accepts optional letters after the slash', function () {
    const result = complete(cursorState('/Eq'))
    expect(result?.from).to.equal(1)
    expect(result?.options).to.have.length(4)
  })

  for (const doc of ['', 'hello /', ' /', '/ text', '/eq1', '/eq more']) {
    it(`returns null for a line containing ${JSON.stringify(doc)}`, function () {
      expect(complete(cursorState(doc))).to.be.null
    })
  }

  it('returns null when text remains after the cursor', function () {
    expect(complete(cursorState('/eq', 1))).to.be.null
  })

  it('returns null with an active selection', function () {
    const state = cursorState('/eq').update({
      selection: EditorSelection.range(1, 3),
    }).state
    expect(complete(state)).to.be.null
  })

  it('accepts letters outside ASCII after the slash', function () {
    expect(complete(cursorState('/表'))?.options).to.have.length(4)
  })

  it('returns null with more than one cursor', function () {
    const state = cursorState(
      '/\n/',
      3,
      EditorState.allowMultipleSelections.of(true)
    ).update({
      selection: EditorSelection.create([
        EditorSelection.cursor(1),
        EditorSelection.cursor(3),
      ]),
    }).state
    expect(complete(state)).to.be.null
  })

  it('returns null before the parser reaches the cursor', function () {
    const doc = 'text \\emph{x}\n'.repeat(80000) + '/'
    const state = EditorState.create({
      doc,
      selection: EditorSelection.cursor(doc.length),
      extensions: new LanguageSupport(LaTeXLanguage),
    })
    expect(complete(state)).to.be.null
  })

  it('returns null in a read-only state', function () {
    expect(complete(cursorState('/', 1, EditorState.readOnly.of(true)))).to.be.null
  })

  it('returns null in Visual mode', function () {
    const view = new EditorView({
      state: cursorState('/', 1, visual('main.tex', true)),
    })
    try {
      expect(slashInsert(new CompletionContext(view.state, 1, false, view))).to.be
        .null
    } finally {
      view.destroy()
    }
  })

  for (const [name, before, after] of [
    ['inline math', '$\n', '\n$'],
    ['display math', '\\[\n', '\n\\]'],
    ['equation', '\\begin{equation}\n', '\n\\end{equation}'],
    ['align', '\\begin{align}\n', '\n\\end{align}'],
    ['verbatim', '\\begin{verbatim}\n', '\n\\end{verbatim}'],
    ['listing', '\\begin{lstlisting}\n', '\n\\end{lstlisting}'],
    ['comment', '\\begin{comment}\n', '\n\\end{comment}'],
    ['text argument', '\\textbf{\n', '\n}'],
    ['section argument', '\\section{\n', '\n}'],
    ['optional argument', '\\cite[\n', '\n]{key}'],
    ['unknown command argument', '\\custom{\n', '\n}'],
    ['unfinished argument', '\\textbf{\n', ''],
  ]) {
    it(`returns null inside ${name}`, function () {
      const state = cursorState(`${before}/${after}`, before.length + 1)
      expect(complete(state)).to.be.null
    })
  }

  it('returns null in a line comment', function () {
    expect(complete(cursorState('% /'))).to.be.null
  })

  it('allows a slash on the line after a comment', function () {
    expect(complete(cursorState('% comment\n/'))).not.to.be.null
  })
})
