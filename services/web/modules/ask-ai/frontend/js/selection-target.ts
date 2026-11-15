import type { EditorView } from '@codemirror/view'
import { Transaction } from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'

export function captureSelection(view: EditorView) {
  const { from, to } = view.state.selection.main
  return {
    view,
    doc: view.state.doc,
    from,
    to,
    text: view.state.sliceDoc(from, to),
  }
}

export type SelectionTarget = ReturnType<typeof captureSelection>

export function targetIsCurrent(target: SelectionTarget) {
  return (
    target.view.dom.isConnected &&
    !target.view.state.readOnly &&
    target.view.state.doc === target.doc
  )
}

export function applySuggestion(target: SelectionTarget, replacement: string) {
  if (!targetIsCurrent(target)) return false
  target.view.dispatch({
    changes: { from: target.from, to: target.to, insert: replacement },
    annotations: [
      Transaction.userEvent.of('input.ai-assistance'),
      isolateHistory.of('full'),
    ],
  })
  return true
}
