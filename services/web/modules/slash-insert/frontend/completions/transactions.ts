import { Completion, pickedCompletion } from '@codemirror/autocomplete'
import { isolateHistory } from '@codemirror/commands'
import {
  EditorState,
  StateEffect,
  Transaction,
  TransactionSpec,
} from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
import { isVisual } from '@/features/source-editor/extensions/visual/visual'

export type InsertionTarget = {
  state: EditorState
  dispatch(
    first: Transaction | TransactionSpec,
    ...rest: TransactionSpec[]
  ): void
}
export type ModalInsertion = {
  (insert: (target: InsertionTarget) => void): void
  cancel(): void
}

const lifecycle = ViewPlugin.define(() => ({
  alive: true,
  destroy() {
    this.alive = false
  },
}))

// Run an existing command against the state with the query removed, then
// dispatch its composed changes, snippet effects and selection just once.
export function replaceQuery(
  view: EditorView,
  completion: Completion,
  from: number,
  to: number,
  command?: (view: EditorView) => unknown,
  modal = false
) {
  const removal = view.state.update({
    changes: { from, to },
    selection: { anchor: from },
  })
  let insertion = removal.state.update({})
  const target = {
    state: removal.state,
    dispatch(first: Transaction | TransactionSpec, ...rest: TransactionSpec[]) {
      insertion =
        first instanceof Transaction
          ? first
          : removal.state.update(first, ...rest)
    },
  } as EditorView
  command?.(target)
  const transaction = view.state.update({
    changes: removal.changes.compose(insertion.changes),
    selection: insertion.newSelection,
    effects: insertion.effects,
    scrollIntoView: insertion.scrollIntoView,
    annotations: [
      pickedCompletion.of(completion),
      isolateHistory.of(modal ? 'before' : 'full'),
    ],
    userEvent: 'input.complete',
  })
  view.dispatch(transaction)
  return transaction
}

// A modal confirms the same input event even when the user takes longer than
// the normal history delay. Keep its event time and isolate it after confirmation.
// Reject stale targets so sharing/mode changes, undo or concurrent edits cannot
// apply a modal at obsolete positions or overwrite a new editor selection.
export function modalInsertion(
  view: EditorView,
  opening: Transaction
): ModalInsertion {
  if (!view.plugin(lifecycle)) {
    view.dispatch({ effects: StateEffect.appendConfig.of(lifecycle) })
  }
  const lifetime = view.plugin(lifecycle)!
  const snapshot = view.state
  const time = opening.annotation(Transaction.time)!
  let used = false
  const apply: ModalInsertion = insert => {
    if (
      used ||
      !lifetime.alive ||
      view.state.readOnly ||
      isVisual(view) ||
      view.composing ||
      view.compositionStarted ||
      !view.state.doc.eq(snapshot.doc) ||
      !view.state.selection.eq(snapshot.selection)
    ) {
      return
    }
    used = true
    insert({
      state: snapshot,
      dispatch(
        first: Transaction | TransactionSpec,
        ...rest: TransactionSpec[]
      ) {
        const transaction =
          first instanceof Transaction ? first : snapshot.update(first, ...rest)
        const completion = transaction.annotation(pickedCompletion)
        view.dispatch({
          changes: transaction.changes,
          selection: transaction.newSelection,
          effects: transaction.effects,
          scrollIntoView: transaction.scrollIntoView,
          annotations: [
            ...(completion ? [pickedCompletion.of(completion)] : []),
            Transaction.time.of(time),
            isolateHistory.of('after'),
          ],
        })
      },
    })
  }
  apply.cancel = () => {
    if (used || !lifetime.alive) return
    used = true
    view.dispatch({ annotations: isolateHistory.of('after') })
  }
  return apply
}
