import { expect } from 'chai'
import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState, EditorSelection, Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { LanguageSupport, ensureSyntaxTree } from '@codemirror/language'
import { LaTeXLanguage } from '@/features/source-editor/languages/latex/latex-language'
import { visual } from '@/features/source-editor/extensions/visual/visual'
import {
  FigureModalProvider,
  FigureModalSource,
  useFigureModalContext,
} from '@/features/source-editor/components/figure-modal/figure-modal-context'
import { FigureModalCurrentProjectSource } from '@/features/source-editor/components/figure-modal/file-sources/figure-modal-project-source'
import { FileTreeDataContext } from '@/shared/context/file-tree-data-context'
import { PermissionsContext } from '@/features/ide-react/context/permissions-context'
import { createElement, Fragment, useEffect } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
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

function ProjectFiles() {
  const { source, getPath, dispatch } = useFigureModalContext()
  useEffect(() => {
    dispatch({
      source: FigureModalSource.FILE_TREE,
      getPath: async () => 'old.png',
    })
  }, [dispatch])
  return createElement(
    Fragment,
    null,
    createElement(FigureModalCurrentProjectSource),
    createElement('output', null, `${source}:${Boolean(getPath)}`)
  )
}

describe('slash Figure project files', function () {
  afterEach(cleanup)

  function mount(write: boolean) {
    return render(
      createElement(
        PermissionsContext.Provider,
        {
          value: {
            read: true,
            write,
            admin: false,
            comment: true,
            resolveOwnComments: false,
            resolveAllComments: false,
            trackedWrite: write,
            labelVersion: false,
          },
        },
        createElement(
          FileTreeDataContext.Provider,
          {
            value: {
              fileTreeData: {
                _id: 'root',
                name: '',
                docs: [],
                folders: [],
                fileRefs: [],
              },
              fileCount: 0,
              fileTreeReadOnly: !write,
              hasFolders: false,
              selectedEntities: [],
              setSelectedEntities() {},
              dispatchRename() {},
              dispatchMove() {},
              dispatchDelete() {},
              dispatchCreateFolder() {},
              dispatchCreateDoc() {},
              dispatchCreateFile() {},
            },
          },
          createElement(FigureModalProvider, null, createElement(ProjectFiles))
        )
      )
    )
  }

  it('keeps Upload reachable even with no project images', function () {
    const screen = mount(true)
    expect(screen.getByDisplayValue('No image files found')).to.exist
    fireEvent.click(screen.getByRole('button', { name: 'Upload from computer' }))
    expect(screen.getByRole('status').textContent).to.equal(
      `${FigureModalSource.FILE_UPLOAD}:false`
    )
  })

  it('does not offer Upload without write permission', function () {
    const screen = mount(false)
    expect(screen.queryByRole('button', { name: 'Upload from computer' })).to.be
      .null
  })
})

describe('slash insert completions', function () {
  it('opens Figure in project files after removing the slash query', function () {
    const view = new EditorView({ state: cursorState('/Figure') })
    let detail: { source: FigureModalSource } | undefined
    let sourceAtOpen: string | undefined
    const listener = (event: Event) => {
      detail = (event as CustomEvent).detail
      sourceAtOpen = view.state.doc.toString()
    }
    window.addEventListener('figure-modal:open', listener)
    try {
      const result = slashInsert(
        new CompletionContext(view.state, 7, false, view)
      )!
      const figure = result.options.find(option => option.label === 'Figure')!
      if (typeof figure.apply !== 'function') {
        throw new Error('Expected a Figure command completion')
      }
      figure.apply(view, figure, result.from, 7)
      expect(sourceAtOpen).to.equal('')
      expect(view.state.selection.main.head).to.equal(0)
      expect(detail?.source).to.equal(FigureModalSource.FILE_TREE)
    } finally {
      window.removeEventListener('figure-modal:open', listener)
      view.destroy()
    }
  })

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
