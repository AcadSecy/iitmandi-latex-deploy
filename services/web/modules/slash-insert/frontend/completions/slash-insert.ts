import {
  closeCompletion,
  Completion,
  CompletionContext,
  CompletionResult,
  completionStatus,
  currentCompletions,
} from '@codemirror/autocomplete'
import { syntaxTreeAvailable } from '@codemirror/language'
import { StateEffect } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
import i18n from 'i18next'
import { FigureModalSource } from '@/features/source-editor/components/figure-modal/figure-modal-context'
import {
  insertCite,
  insertTable,
  wrapInDisplayMath,
} from '@/features/source-editor/extensions/toolbar/commands'
import { isVisual } from '@/features/source-editor/extensions/visual/visual'
import { ancestorNodeOfType } from '@/features/source-editor/utils/tree-operations/ancestors'
import { modalInsertion, replaceQuery } from './transactions'

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

const slashOptions = new WeakSet<Completion>()
const blocked = (view: EditorView) =>
  view.state.readOnly ||
  isVisual(view) ||
  view.composing ||
  view.compositionStarted
const hasSlashPopup = (view: EditorView) =>
  currentCompletions(view.state).some(option => slashOptions.has(option))

// The completion-source hook supplies no permanent view extension. Install the
// small lifecycle guard once, when this view first offers slash completions.
const popupGuard = ViewPlugin.define(
  view => {
    let alive = true
    return {
      update() {
        if (blocked(view) && hasSlashPopup(view)) {
          // View updates cannot dispatch recursively.
          queueMicrotask(() => {
            if (alive && blocked(view) && hasSlashPopup(view)) {
              closeCompletion(view)
            }
          })
        }
      },
      destroy() {
        alive = false
      },
    }
  },
  {
    eventHandlers: {
      compositionstart(_event, view) {
        if (hasSlashPopup(view)) closeCompletion(view)
        return false
      },
    },
  }
)

export default function slashInsert(
  context: CompletionContext
): CompletionResult | null {
  const { state, pos, view } = context
  if (
    state.readOnly ||
    state.selection.ranges.length > 1 ||
    !state.selection.main.empty ||
    !syntaxTreeAvailable(state, pos) ||
    (view && blocked(view))
  ) {
    return null
  }

  const line = state.doc.lineAt(pos)
  if (pos !== line.to || !/^\/\p{L}*$/u.test(line.text)) return null
  if (
    excludedNodeTypes.some(type => ancestorNodeOfType(state, pos, type, -1))
  ) {
    return null
  }
  if (view && !view.plugin(popupGuard)) {
    view.dispatch({ effects: StateEffect.appendConfig.of(popupGuard) })
  }
  const fromPopup = completionStatus(state) !== null
  const actions = [
    { label: i18n.t('display_math'), command: wrapInDisplayMath },
    {
      label: i18n.t('table'),
      command: (view: EditorView) => insertTable(view, 3, 3),
    },
    { label: i18n.t('figure'), modal: 'figure' },
    { label: i18n.t('citation'), command: insertCite, modal: 'citation' },
  ]

  return {
    from: line.from + 1,
    options: actions.map<Completion>(({ label, command, modal }) => {
      const option: Completion = {
        label,
        apply(view, completion, from, to) {
          // Recheck a retained result against current permissions, mode, syntax
          // and selection, including results invalidated by settings changes.
          const current = slashInsert(
            new CompletionContext(
              view.state,
              view.state.selection.main.head,
              false,
              view
            )
          )
          if (
            !current ||
            current.from !== from ||
            view.state.selection.main.head !== to ||
            (fromPopup && !currentCompletions(view.state).includes(completion))
          ) {
            closeCompletion(view)
            return
          }
          const opening = replaceQuery(
            view,
            completion,
            from - 1,
            to,
            command,
            Boolean(modal)
          )
          if (modal === 'figure') {
            window.dispatchEvent(
              new CustomEvent('figure-modal:open', {
                detail: {
                  source: FigureModalSource.FILE_TREE,
                  insert: modalInsertion(view, opening),
                },
              })
            )
          } else if (modal === 'citation') {
            const { from, to } = view.state.selection.main
            window.dispatchEvent(
              new CustomEvent('reference:openPicker', {
                detail: {
                  insertFrom: from,
                  insertTo: to,
                  braceFrom: from,
                  braceTo: to,
                  selectedTokens: [],
                  insert: modalInsertion(view, opening),
                },
              })
            )
          }
        },
      }
      slashOptions.add(option)
      return option
    }),
  }
}
