import { ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  OLModal,
  OLModalBody,
  OLModalFooter,
  OLModalHeader,
  OLModalTitle,
} from '@/shared/components/ol/ol-modal'
import OLButton from '@/shared/components/ol/ol-button'
import OLForm from '@/shared/components/ol/ol-form'
import OLFormGroup from '@/shared/components/ol/ol-form-group'
import OLFormLabel from '@/shared/components/ol/ol-form-label'
import OLFormSelect from '@/shared/components/ol/ol-form-select'
import OLFormText from '@/shared/components/ol/ol-form-text'
import Notification from '@/shared/components/notification'
import {
  useCodeMirrorStateContext,
  useCodeMirrorViewContext,
} from '@/features/source-editor/components/codemirror-context'
import { useEditorManagerContext } from '@/features/ide-react/context/editor-manager-context'
import { useProjectContext } from '@/shared/context/project-context'
import { useDetachCompileContext } from '@/shared/context/detach-compile-context'
import {
  applyPageSetup,
  hasPageSetup,
  lineChanges,
  PageSetup,
  readPageSetup,
} from '../preamble'

// The select value for "leave it to the template"
const DEFAULT = ''

type Choice = { value: string; label: string }

const FONT_SIZES: Choice[] = ['10pt', '11pt', '12pt'].map(size => ({
  value: size,
  label: size.replace('pt', ' pt'),
}))

const MARGINS: Choice[] = [
  { value: '1cm', label: '1 cm' },
  { value: '1.5cm', label: '1.5 cm' },
  { value: '2cm', label: '2 cm' },
  { value: '2.5cm', label: '2.5 cm' },
  { value: '1in', label: '1 inch (2.54 cm)' },
  { value: '3cm', label: '3 cm' },
  { value: '3.5cm', label: '3.5 cm' },
  { value: '4cm', label: '4 cm' },
]

const PAPERS: Choice[] = [
  { value: 'a4paper', label: 'A4' },
  { value: 'letterpaper', label: 'Letter' },
]

// Values from the document that the lists don't offer are shown as they are,
// so that opening and applying the dialog never changes them
function withCurrent(
  choices: Choice[],
  current: string | null,
  label?: string
) {
  if (!current || choices.some(choice => choice.value === current)) {
    return choices
  }
  return [...choices, { value: current, label: label ?? current }]
}

type Field = keyof PageSetup

function SelectField({
  id,
  label,
  value,
  choices,
  onChange,
  disabled,
  help,
}: {
  id: Field
  label: string
  value: string | null
  choices: Choice[]
  onChange: (field: Field, value: string | null) => void
  disabled?: boolean
  help?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <OLFormGroup controlId={`page-setup-${id}`}>
      <OLFormLabel>{label}</OLFormLabel>
      <OLFormSelect
        value={value ?? DEFAULT}
        disabled={disabled}
        onChange={event =>
          onChange(
            id,
            event.target.value === DEFAULT ? null : event.target.value
          )
        }
      >
        <option value={DEFAULT}>{t('page_setup_template_default')}</option>
        {choices.map(choice => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </OLFormSelect>
      {help && <OLFormText>{help}</OLFormText>}
    </OLFormGroup>
  )
}

/**
 * Change the font size, line spacing, margins, paper size and font of the
 * open main file without writing LaTeX. The dialog edits the preamble, which
 * the visual editor hides, and recompiles so that the PDF shows the result.
 */
export default function PageSetupModal({ onHide }: { onHide: () => void }) {
  const { t } = useTranslation()
  const view = useCodeMirrorViewContext()
  const state = useCodeMirrorStateContext()
  const { openDocWithId } = useEditorManagerContext()
  const { project } = useProjectContext()
  const { startCompile } = useDetachCompileContext()

  const text = state.doc.toString()
  const info = useMemo(() => readPageSetup(text), [text])
  const [changes, setChanges] = useState<Partial<PageSetup>>({})

  const setup: PageSetup | null = info ? { ...info.setup, ...changes } : null

  const change = (field: Field, value: string | null) => {
    setChanges(current => {
      const next = { ...current }
      if (info && info.setup[field] === value) {
        delete next[field]
      } else {
        // the select only offers values that fit the field
        next[field] = value as never
      }
      return next
    })
  }

  const apply = () => {
    const before = view.state.doc.toString()
    const after = applyPageSetup(before, changes)
    const edits = lineChanges(before, after)
    if (edits.length > 0) {
      view.dispatch({ changes: edits, userEvent: 'input.page-setup' })
      startCompile()
    }
    onHide()
  }

  let body: ReactNode
  if (!info || !setup) {
    const rootDocId = project?.rootDocId
    body = (
      <>
        <p>{t('page_setup_not_main_file')}</p>
        {rootDocId && (
          <OLButton
            variant="secondary"
            onClick={() => openDocWithId(rootDocId)}
          >
            {t('page_setup_open_main_file')}
          </OLButton>
        )}
      </>
    )
  } else if (!hasPageSetup(info.documentClass)) {
    body = <p>{t('page_setup_slides')}</p>
  } else {
    body = (
      <OLForm
        onSubmit={event => {
          event.preventDefault()
          apply()
        }}
      >
        <p className="text-muted">{t('page_setup_explanation')}</p>
        <SelectField
          id="fontSize"
          label={t('page_setup_font_size')}
          value={setup.fontSize}
          choices={withCurrent(FONT_SIZES, setup.fontSize)}
          onChange={change}
        />
        <SelectField
          id="spacing"
          label={t('page_setup_line_spacing')}
          value={setup.spacing}
          choices={withCurrent(
            [
              { value: 'single', label: t('page_setup_spacing_single') },
              { value: 'onehalf', label: t('page_setup_spacing_onehalf') },
              { value: 'double', label: t('page_setup_spacing_double') },
            ],
            setup.spacing,
            t('page_setup_as_in_document')
          )}
          onChange={change}
        />
        <SelectField
          id="margin"
          label={t('page_setup_margins')}
          value={setup.margin}
          choices={withCurrent(
            MARGINS,
            setup.margin,
            setup.margin === 'custom'
              ? t('page_setup_margins_custom')
              : setup.margin?.replace(/(\d)([a-z])/, '$1 $2')
          )}
          onChange={change}
        />
        <SelectField
          id="paper"
          label={t('page_setup_paper_size')}
          value={setup.paper}
          choices={withCurrent(
            PAPERS,
            setup.paper,
            setup.paper?.replace(/paper$/, '').toUpperCase()
          )}
          onChange={change}
        />
        <SelectField
          id="font"
          label={t('page_setup_font')}
          value={setup.font}
          choices={withCurrent(
            [
              { value: 'times', label: 'Times' },
              { value: 'helvetica', label: t('page_setup_font_helvetica') },
            ],
            setup.font,
            t('page_setup_as_in_document')
          )}
          onChange={change}
          disabled={!info.fontEditable}
          help={!info.fontEditable && t('page_setup_font_locked')}
        />
        {/* lets Enter in a field apply the changes */}
        <button type="submit" hidden />
      </OLForm>
    )
  }

  const canApply = Boolean(info && hasPageSetup(info.documentClass))

  return (
    <OLModal show onHide={onHide}>
      <OLModalHeader>
        <OLModalTitle>{t('page_setup')}</OLModalTitle>
      </OLModalHeader>
      <OLModalBody>
        {body}
        {canApply && Object.keys(changes).length > 0 && (
          <Notification
            type="info"
            content={t('page_setup_undo_hint')}
            className="mb-0"
          />
        )}
      </OLModalBody>
      <OLModalFooter>
        <OLButton variant="secondary" onClick={onHide}>
          {canApply ? t('cancel') : t('close')}
        </OLButton>
        {canApply && (
          <OLButton
            variant="primary"
            onClick={apply}
            disabled={Object.keys(changes).length === 0}
          >
            {t('page_setup_apply')}
          </OLButton>
        )}
      </OLModalFooter>
    </OLModal>
  )
}
