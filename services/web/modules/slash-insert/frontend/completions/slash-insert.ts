import {
  Completion,
  CompletionContext,
  CompletionResult,
  pickedCompletion,
} from '@codemirror/autocomplete'
import { syntaxTreeAvailable } from '@codemirror/language'
import { Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import i18n from 'i18next'
import { FigureModalSource } from '@/features/source-editor/components/figure-modal/figure-modal-context'
import {
  insertTable,
  wrapInDisplayMath,
} from '@/features/source-editor/extensions/toolbar/commands'
import { isVisual } from '@/features/source-editor/extensions/visual/visual'
import { ancestorNodeOfType } from '@/features/source-editor/utils/tree-operations/ancestors'

const excludedNodeTypes = [
  '$MathContainer',
  'EquationEnvironment',
  'EquationArrayEnvironment',
  'VerbatimEnvironment',
  'VerbContent',
  'LstInlineContent',
  'Comment',
  '$Argument',
]

export default function slashInsert(
  context: CompletionContext
): CompletionResult | null {
  const { state, pos, view } = context
  if (
    state.readOnly ||
    state.selection.ranges.length > 1 ||
    !state.selection.main.empty ||
    // fail closed until the parser has reached the cursor
    !syntaxTreeAvailable(state, pos) ||
    (view && isVisual(view))
  ) {
    return null
  }

  const line = state.doc.lineAt(pos)
  if (pos !== line.to || !/^\/\p{L}*$/u.test(line.text)) {
    return null
  }

  if (excludedNodeTypes.some(type => ancestorNodeOfType(state, pos, type, -1))) {
    return null
  }

  const actions: [string, (view: EditorView) => void][] = [
    [i18n.t('display_math'), wrapInDisplayMath],
    [i18n.t('table'), view => insertTable(view, 3, 3)],
    [
      i18n.t('figure'),
      () =>
        window.dispatchEvent(
          new CustomEvent('figure-modal:open', {
            detail: { source: FigureModalSource.FILE_TREE },
          })
        ),
    ],
    [
      i18n.t('citation'),
      () => window.dispatchEvent(new CustomEvent('reference:openPicker')),
    ],
  ]

  return {
    // Match letters against labels, and remove the slash when applying.
    from: line.from + 1,
    options: actions.map<Completion>(([label, run]) => ({
      label,
      apply(view, completion, from, to) {
        view.dispatch({
          changes: { from: from - 1, to, insert: '' },
          selection: { anchor: from - 1 },
          // keep the slash removal out of history so one undo removes the insertion
          annotations: [
            pickedCompletion.of(completion),
            Transaction.addToHistory.of(false),
          ],
          userEvent: 'input.complete',
        })
        run(view)
      },
    })),
  }
}
