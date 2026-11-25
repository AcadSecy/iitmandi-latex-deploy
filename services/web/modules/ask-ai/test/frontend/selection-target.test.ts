import { expect } from 'chai'
import { EditorView } from '@codemirror/view'
import { EditorState, Transaction } from '@codemirror/state'
import { history, undo, redo } from '@codemirror/commands'
import {
  captureSelection,
  applySuggestion,
} from '../../frontend/js/selection-target'

describe('assistance replacement safety', function () {
  let view: EditorView
  beforeEach(function () {
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: 'before 1/2 after',
        selection: { anchor: 7, head: 10 },
        extensions: [history()],
      }),
    })
  })
  afterEach(function () {
    view.destroy()
  })
  it('makes one undoable replacement without altering surrounding text', function () {
    expect(applySuggestion(captureSelection(view), '\\frac{1}{2}')).to.equal(
      true
    )
    expect(view.state.doc.toString()).to.equal('before \\frac{1}{2} after')
    undo(view)
    expect(view.state.doc.toString()).to.equal('before 1/2 after')
    redo(view)
    expect(view.state.doc.toString()).to.equal('before \\frac{1}{2} after')
  })
  it('rejects collaborative edits that arrived while waiting', function () {
    const target = captureSelection(view)
    view.dispatch({
      changes: { from: 0, insert: 'remote ' },
      annotations: Transaction.remote.of(true),
    })
    expect(applySuggestion(target, 'replacement')).to.equal(false)
    expect(view.state.doc.toString()).to.equal('remote before 1/2 after')
  })
  it('rejects a document switch and read-only mode', function () {
    const target = captureSelection(view)
    view.setState(
      EditorState.create({
        doc: 'another document',
        extensions: [EditorState.readOnly.of(true)],
      })
    )
    expect(applySuggestion(target, 'replacement')).to.equal(false)
  })
})
