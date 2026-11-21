import { expect } from 'chai'
import {
  acceptCompletion,
  closeCompletion,
  CompletionContext,
  completionStatus,
  currentCompletions,
  snippet,
  startCompletion,
} from '@codemirror/autocomplete'
import {
  EditorState,
  EditorSelection,
  Extension,
  Transaction,
} from '@codemirror/state'
import { history, redo, undo, undoDepth } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
import {
  LanguageSupport,
  ensureSyntaxTree,
  indentUnit,
} from '@codemirror/language'
import { LaTeXLanguage } from '@/features/source-editor/languages/latex/latex-language'
import {
  setVisual,
  visual,
} from '@/features/source-editor/extensions/visual/visual'
import {
  autoComplete,
  setAutoComplete,
} from '@/features/source-editor/extensions/auto-complete'
import {
  editable,
  setEditable,
} from '@/features/source-editor/extensions/editable'
import {
  insertCite,
  insertTable,
  wrapInDisplayMath,
} from '@/features/source-editor/extensions/toolbar/commands'
import {
  FigureModalProvider,
  FigureModalSource,
  useFigureModalContext,
} from '@/features/source-editor/components/figure-modal/figure-modal-context'
import { FigureModalCurrentProjectSource } from '@/features/source-editor/components/figure-modal/file-sources/figure-modal-project-source'
import { FileTreeDataContext } from '@/shared/context/file-tree-data-context'
import { PermissionsContext } from '@/features/ide-react/context/permissions-context'
import { createElement, Fragment, ReactNode, useEffect } from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react'
import sinon from 'sinon'
import ReferencePickerController from '../../../reference-picker/frontend/components/reference-picker-controller'
import { EditorViewContext } from '@/features/ide-react/context/editor-view-context'
import { ReferencesContext } from '@/features/ide-react/context/references-context'
import { FigureModal } from '@/features/source-editor/components/figure-modal/figure-modal'
import { CodeMirrorViewContext } from '@/features/source-editor/components/codemirror-context'
import { SplitTestProvider } from '@/shared/context/split-test-context'
import { FileRef } from '../../../../types/file-ref'
import {
  editFigureDataEffect,
  FigureData,
  figureModal,
} from '@/features/source-editor/extensions/figure-modal'
import slashInsert from '../../frontend/completions/slash-insert'

function cursorState(
  doc: string,
  cursorPos = doc.length,
  extensions: Extension = []
) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursorPos),
    extensions: [
      new LanguageSupport(LaTeXLanguage),
      indentUnit.of('    '),
      extensions,
    ],
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

  function mount(
    write: boolean,
    child: ReactNode = createElement(
      FigureModalProvider,
      null,
      createElement(ProjectFiles)
    ),
    fileRefs: FileRef[] = []
  ) {
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
                name: 'rootFolder',
                docs: [],
                folders: [],
                fileRefs,
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
          child
        )
      )
    )
  }

  it('keeps Upload reachable even with no project images', function () {
    const screen = mount(true)
    expect(screen.getByDisplayValue('No image files found')).to.exist
    fireEvent.click(
      screen.getByRole('button', { name: 'Upload from computer' })
    )
    expect(screen.getByRole('status').textContent).to.equal(
      `${FigureModalSource.FILE_UPLOAD}:false`
    )
  })

  it('does not offer Upload without write permission', function () {
    const screen = mount(false)
    expect(screen.queryByRole('button', { name: 'Upload from computer' })).to.be
      .null
  })

  for (const staleFigure of [false, true]) {
    it(`uses the existing Figure modal${staleFigure ? ' after editing another figure' : ''} and undoes its saved LaTeX including the query`, async function () {
      const oldFigure =
        '\\begin{figure}\\includegraphics{old.png}\\end{figure}\n'
      const original = `${staleFigure ? oldFigure : ''}/Figure`
      const view = new EditorView({
        state: cursorState(original, original.length, [
          history({ newGroupDelay: 250 }),
          figureModal(),
        ]),
      })
      if (staleFigure) {
        const graphicsFrom = oldFigure.indexOf('\\includegraphics')
        const fileFrom = oldFigure.indexOf('old.png')
        view.dispatch({
          effects: editFigureDataEffect.of(
            new FigureData({
              from: 0,
              to: oldFigure.length - 1,
              caption: null,
              label: null,
              graphicsCommand: { from: graphicsFrom, to: fileFrom + 8 },
              file: { from: fileFrom, to: fileFrom + 7, path: 'old.png' },
              graphicsCommandArguments: null,
            })
          ),
        })
      }
      const screen = mount(
        true,
        createElement(
          CodeMirrorViewContext.Provider,
          { value: view },
          createElement(SplitTestProvider, null, createElement(FigureModal))
        ),
        [{ _id: 'image', name: 'example.png', hash: 'image-hash' }]
      )
      const savedBlock =
        '\\begin{figure}\n    \\centering\n    \\includegraphics[width=0.5\\linewidth]{example.png}\n    \\caption{Enter Caption}\n    \\label{fig:placeholder}\n\\end{figure}'
      const saved = `${staleFigure ? oldFigure : ''}${savedBlock}`
      try {
        act(() => applyOption(view, 'Figure'))
        expect(view.state.doc.toString()).to.equal(staleFigure ? oldFigure : '')
        fireEvent.click(
          await screen.findByRole('combobox', { name: 'Image file' })
        )
        fireEvent.click(await screen.findByText('example.png'))
        const clock = sinon.useFakeTimers({
          now: Date.now() + 60000,
          toFake: ['Date'],
        })
        try {
          fireEvent.click(screen.getByRole('button', { name: 'Insert figure' }))
          await waitFor(() => expect(view.state.doc.toString()).to.equal(saved))
        } finally {
          clock.restore()
        }
        expect(
          view.state.sliceDoc(
            view.state.selection.main.from,
            view.state.selection.main.to
          )
        ).to.equal('Enter Caption')
        expect(undoDepth(view.state)).to.equal(1)
        undo(view)
        expect(view.state.doc.toString()).to.equal(original)
        expect(view.state.selection.main.head).to.equal(original.length)
        redo(view)
        expect(view.state.doc.toString()).to.equal(saved)
      } finally {
        cleanup()
        view.destroy()
      }
    })
  }
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
    expect(complete(cursorState('/', 1, EditorState.readOnly.of(true)))).to.be
      .null
  })

  it('returns null in Visual mode', function () {
    const view = new EditorView({
      state: cursorState('/', 1, visual('main.tex', true)),
    })
    try {
      expect(slashInsert(new CompletionContext(view.state, 1, false, view))).to
        .be.null
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

function applyOption(view: EditorView, label: string) {
  const to = view.state.selection.main.head
  const result = slashInsert(
    new CompletionContext(view.state, to, false, view)
  )!
  const option = result.options.find(option => option.label === label)!
  if (typeof option.apply !== 'function') throw new Error('Expected a command')
  option.apply(view, option, result.from, to)
}

describe('slash insertion transactions', function () {
  let view: EditorView
  afterEach(function () {
    cleanup()
    view?.destroy()
    sinon.restore()
  })

  const commands = [
    ['Display math', wrapInDisplayMath],
    ['Table', (view: EditorView) => insertTable(view, 3, 3)],
    ['Citation', insertCite],
  ] as const
  for (const [label, command] of commands) {
    it(`replaces a query with ${label} in one transaction and restores it with one undo`, function () {
      const original = 'before\n/query\nafter'
      const cursor = original.indexOf('\nafter')
      let changes = 0
      view = new EditorView({
        state: cursorState(original, cursor, [
          history({ newGroupDelay: 250 }),
          EditorView.updateListener.of(update => {
            changes += update.transactions.filter(tr => tr.docChanged).length
          }),
        ]),
      })
      const expected = new EditorView({
        state: cursorState('before\n\nafter', 7),
      })
      try {
        command(expected)
        applyOption(view, label)
        expect(view.state.doc.toString()).to.equal(
          expected.state.doc.toString()
        )
        expect(view.state.selection.eq(expected.state.selection)).to.be.true
        expect(changes).to.equal(1)
        expect(undoDepth(view.state)).to.equal(1)
        expect(undo(view)).to.be.true
        expect(view.state.doc.toString()).to.equal(original)
        expect(view.state.selection.main.head).to.equal(cursor)
        expect(redo(view)).to.be.true
        expect(view.state.doc.toString()).to.equal(
          expected.state.doc.toString()
        )
      } finally {
        expected.destroy()
      }
    })
  }

  it('does not merge a toolbar insertion with preceding or subsequent typing', function () {
    view = new EditorView({ state: cursorState('/', 1, history()) })
    view.dispatch({
      changes: { from: 1, insert: 'Table' },
      selection: { anchor: 6 },
      userEvent: 'input.type',
    })
    applyOption(view, 'Table')
    const inserted = view.state.doc.toString()
    view.dispatch({
      changes: { from: view.state.selection.main.head, insert: 'cell' },
      userEvent: 'input.type',
    })
    undo(view)
    expect(view.state.doc.toString()).to.equal(inserted)
    undo(view)
    expect(view.state.doc.toString()).to.equal('/Table')
    undo(view)
    expect(view.state.doc.toString()).to.equal('/')
  })

  it('makes removing a Figure query undoable before confirmation', function () {
    view = new EditorView({ state: cursorState('/Figure', 7, history()) })
    applyOption(view, 'Figure')
    expect(view.state.doc.toString()).to.equal('')
    expect(undo(view)).to.be.true
    expect(view.state.doc.toString()).to.equal('/Figure')
    expect(view.state.selection.main.head).to.equal(7)
  })

  it('passes explicit bounds to the citation picker without a duplicate cite', function () {
    view = new EditorView({ state: cursorState('/Citation', 9, history()) })
    let detail: any
    const listener = (event: Event) => {
      detail = (event as CustomEvent).detail
    }
    window.addEventListener('reference:openPicker', listener)
    try {
      applyOption(view, 'Citation')
      expect(view.state.doc.toString()).to.equal('\\cite{}')
      expect(detail).to.include({
        insertFrom: 6,
        insertTo: 6,
        braceFrom: 6,
        braceTo: 6,
      })
      expect(detail.selectedTokens).to.deep.equal([])
      expect(view.state.selection.main.head).to.equal(6)
    } finally {
      window.removeEventListener('reference:openPicker', listener)
    }
  })

  it('groups a delayed Figure modal insertion with query removal', function () {
    view = new EditorView({
      state: cursorState('/Figure', 7, history({ newGroupDelay: 250 })),
    })
    let detail: any
    const listener = (event: Event) => {
      detail = (event as CustomEvent).detail
    }
    window.addEventListener('figure-modal:open', listener)
    const clock = sinon.useFakeTimers({ now: 10000, toFake: ['Date'] })
    try {
      applyOption(view, 'Figure')
      expect(detail.insert).to.be.a('function')
      clock.tick(60000)
      detail.insert((target: Pick<EditorView, 'state' | 'dispatch'>) => {
        snippet(
          '\\begin{figure}\n\\includegraphics{example.png}\n\\end{figure}${}'
        )(target, { label: 'figure' }, 0, 0)
      })
      expect(view.state.doc.toString()).to.equal(
        '\\begin{figure}\n\\includegraphics{example.png}\n\\end{figure}'
      )
      expect(undoDepth(view.state)).to.equal(1)
      undo(view)
      expect(view.state.doc.toString()).to.equal('/Figure')
      expect(view.state.selection.main.head).to.equal(7)
      redo(view)
      expect(view.state.doc.toString()).to.include('example.png')
    } finally {
      window.removeEventListener('figure-modal:open', listener)
      clock.restore()
    }
  })

  it('isolates a canceled modal from subsequent typing', function () {
    view = new EditorView({ state: cursorState('/Figure', 7, history()) })
    let detail: any
    const listener = (event: Event) => {
      detail = (event as CustomEvent).detail
    }
    window.addEventListener('figure-modal:open', listener)
    try {
      applyOption(view, 'Figure')
      expect(detail.insert.cancel).to.be.a('function')
      detail.insert.cancel()
      view.dispatch({
        changes: { from: 0, insert: 'text' },
        userEvent: 'input.type',
      })
      undo(view)
      expect(view.state.doc.toString()).to.equal('')
      undo(view)
      expect(view.state.doc.toString()).to.equal('/Figure')
    } finally {
      window.removeEventListener('figure-modal:open', listener)
    }
  })

  for (const [name, change] of [
    [
      'read-only sharing',
      (view: EditorView) => view.dispatch(setEditable(false)),
    ],
    ['Visual mode', (view: EditorView) => view.dispatch(setVisual(true))],
    [
      'concurrent editing',
      (view: EditorView) =>
        view.dispatch({
          changes: { from: 0, insert: 'remote' },
          annotations: [
            Transaction.remote.of(true),
            Transaction.addToHistory.of(false),
          ],
        }),
    ],
    [
      'a new selection',
      (view: EditorView) => view.dispatch({ selection: { anchor: 0 } }),
    ],
    ['undo', (view: EditorView) => undo(view)],
    ['editor destruction', (view: EditorView) => view.destroy()],
  ] as const) {
    it(`rejects a stale Figure confirmation after ${name}`, function () {
      const original = 'before\n/Figure\nafter'
      view = new EditorView({
        state: cursorState(original, 14, [
          history(),
          editable(),
          visual('main.tex', false),
        ]),
      })
      view.dispatch(setEditable(true))
      let detail: any
      const listener = (event: Event) => {
        detail = (event as CustomEvent).detail
      }
      window.addEventListener('figure-modal:open', listener)
      try {
        applyOption(view, 'Figure')
        change(view)
        const doc = view.state.doc.toString()
        const selection = view.state.selection
        let applied = false
        detail.insert(() => {
          applied = true
        })
        expect(applied).to.be.false
        expect(view.state.doc.toString()).to.equal(doc)
        expect(view.state.selection.eq(selection)).to.be.true
      } finally {
        window.removeEventListener('figure-modal:open', listener)
      }
    })
  }

  it('uses the real picker and undoes a confirmed citation including the query', async function () {
    view = new EditorView({
      state: cursorState('/Citation', 9, history({ newGroupDelay: 250 })),
    })
    const screen = render(
      createElement(
        EditorViewContext.Provider,
        { value: { view, setView() {} } },
        createElement(
          ReferencesContext.Provider,
          {
            value: {
              referenceKeys: new Set(['sample2026']),
              async indexAllReferences() {},
              async searchLocalReferences() {
                return {
                  hits: [
                    {
                      _source: {
                        EntryKey: 'sample2026',
                        Fields: {
                          author: 'Example',
                          title: 'Sample reference',
                          year: '2026',
                          date: '',
                          journal: '',
                        },
                      },
                    },
                  ],
                }
              },
            },
          },
          createElement(ReferencePickerController)
        )
      )
    )
    act(() => applyOption(view, 'Citation'))
    expect(view.state.doc.toString()).to.equal('\\cite{}')
    fireEvent.click(await screen.findByText('Sample reference'))
    const clock = sinon.useFakeTimers({
      now: Date.now() + 60000,
      toFake: ['Date'],
    })
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Insert' }))
      expect(view.state.doc.toString()).to.equal('\\cite{sample2026}')
      expect(undoDepth(view.state)).to.equal(1)
      expect(view.state.selection.main.head).to.equal(16)
      undo(view)
      expect(view.state.doc.toString()).to.equal('/Citation')
      expect(view.state.selection.main.head).to.equal(9)
    } finally {
      clock.restore()
    }
  })
})

for (const doc of [
  'https://example.com/',
  '\\url{https://example.com/}',
  '\\foo/',
  'mid/line prose',
  '\\verb|/|',
  '\\lstinline|/|',
]) {
  describe('literal slash contexts', function () {
    it(`keeps ${JSON.stringify(doc)} literal`, function () {
      const state = cursorState(doc, doc.indexOf('/') + 1)
      expect(complete(state)).to.be.null
      expect(state.doc.toString()).to.equal(doc)
    })
  })
}

describe('slash popup transitions', function () {
  let view: EditorView
  afterEach(function () {
    view?.destroy()
    sinon.restore()
  })
  function createPopup(enabled = true) {
    view = new EditorView({
      state: cursorState('/Table', 6, [
        history(),
        editable(),
        visual('main.tex', false),
        autoComplete({ enabled }),
        LaTeXLanguage.data.of({ autocomplete: slashInsert }),
      ]),
    })
    view.dispatch(setEditable(true))
  }
  async function open() {
    startCompletion(view)
    await waitFor(() => expect(completionStatus(view.state)).to.equal('active'))
  }

  it('Escape dismisses the real popup without changing any source byte or selection', async function () {
    createPopup()
    await open()
    const selection = view.state.selection
    view.contentDOM.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
    expect(completionStatus(view.state)).to.be.null
    expect(view.state.doc.toString()).to.equal('/Table')
    expect(view.state.selection.eq(selection)).to.be.true
    expect(undoDepth(view.state)).to.equal(0)
  })

  it('offers no popup when autocomplete is disabled', function () {
    createPopup(false)
    expect(startCompletion(view)).to.be.false
    expect(acceptCompletion(view)).to.be.false
    expect(view.state.doc.toString()).to.equal('/Table')
  })

  it('opens automatically when a slash is typed on a blank Code line', async function () {
    createPopup()
    view.dispatch({ changes: { from: 0, to: 6 }, selection: { anchor: 0 } })
    view.dispatch({
      changes: { from: 0, insert: '/' },
      selection: { anchor: 1 },
      userEvent: 'input.type',
    })
    await waitFor(() => expect(completionStatus(view.state)).to.equal('active'))
    expect(
      currentCompletions(view.state).map(option => option.label)
    ).to.have.members(['Display math', 'Table', 'Figure', 'Citation'])
    closeCompletion(view)
    expect(view.state.doc.toString()).to.equal('/')
  })

  it('removes an open popup when autocomplete is turned off', async function () {
    createPopup()
    await open()
    view.dispatch(setAutoComplete({ enabled: false }))
    expect(completionStatus(view.state)).to.be.null
    expect(acceptCompletion(view)).to.be.false
    expect(view.state.doc.toString()).to.equal('/Table')
  })

  for (const [name, transition] of [
    ['read-only sharing access', () => setEditable(false)],
    ['Visual mode', () => setVisual(true)],
  ] as const) {
    it(`closes an open popup on a transition to ${name}`, async function () {
      createPopup()
      await open()
      const option = currentCompletions(view.state).find(
        option => option.label === 'Table'
      )!
      view.dispatch(transition())
      if (typeof option.apply !== 'function')
        throw new Error('Expected a command')
      option.apply(view, option, 1, 6)
      expect(view.state.doc.toString()).to.equal('/Table')
      await waitFor(() => expect(completionStatus(view.state)).to.be.null)
    })
  }

  it('does not offer or accept a slash completion during IME composition', async function () {
    createPopup()
    await open()
    const option = currentCompletions(view.state)[0]
    sinon.stub(view, 'composing').get(() => true)
    expect(slashInsert(new CompletionContext(view.state, 6, false, view))).to.be
      .null
    if (typeof option.apply !== 'function')
      throw new Error('Expected a command')
    option.apply(view, option, 1, 6)
    expect(view.state.doc.toString()).to.equal('/Table')
    closeCompletion(view)
  })

  it('stays off from compositionstart before the first IME edit', async function () {
    createPopup()
    await open()
    view.contentDOM.dispatchEvent(
      new window.CompositionEvent('compositionstart', { bubbles: true })
    )
    expect(completionStatus(view.state)).to.be.null
    sinon.stub(view, 'composing').get(() => false)
    sinon.stub(view, 'compositionStarted').get(() => true)
    expect(slashInsert(new CompletionContext(view.state, 6, false, view))).to.be
      .null
    expect(view.state.doc.toString()).to.equal('/Table')
  })

  for (const key of ['Enter', 'Tab']) {
    it(`accepts with ${key} and restores the query with one undo`, async function () {
      createPopup()
      await open()
      view.contentDOM.dispatchEvent(
        new window.KeyboardEvent('keydown', { key, bubbles: true })
      )
      expect(view.state.doc.toString()).to.include('\\begin{table}')
      undo(view)
      expect(view.state.doc.toString()).to.equal('/Table')
      expect(view.state.selection.main.head).to.equal(6)
    })
  }
})
