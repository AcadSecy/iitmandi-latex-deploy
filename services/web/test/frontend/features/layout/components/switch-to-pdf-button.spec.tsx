import SwitchToPDFButton from '@/features/source-editor/components/switch-to-pdf-button'
import { EditorProviders } from '../../../helpers/editor-providers'

describe('<SwitchToPDFButton />', function () {
  for (const width of [360, 390, 767, 768, 1440]) {
    it(`preserves the desktop shortcut only at desktop widths (${width}px)`, function () {
      cy.viewport(width, 844)
      cy.mount(
        <EditorProviders
          layoutContext={{
            view: 'editor',
            pdfLayout: 'flat',
            chatIsOpen: false,
          }}
        >
          <div className="ide-redesign-main">
            <SwitchToPDFButton />
          </div>
        </EditorProviders>
      )

      cy.contains('button', 'Switch to PDF').should(
        width < 768 ? 'not.be.visible' : 'be.visible'
      )
    })
  }

  it('shows button in full screen editor layout', function () {
    cy.mount(
      <EditorProviders
        layoutContext={{ view: 'editor', pdfLayout: 'flat', chatIsOpen: false }}
      >
        <SwitchToPDFButton />
      </EditorProviders>
    )

    cy.findByRole('button', { name: 'Switch to PDF' })
  })

  it('does not show button in split screen layout', function () {
    cy.mount(
      <EditorProviders
        layoutContext={{
          view: 'editor',
          pdfLayout: 'sideBySide',
          chatIsOpen: false,
        }}
      >
        <SwitchToPDFButton />
      </EditorProviders>
    )

    cy.findByRole('button', { name: 'Switch to PDF' }).should('not.exist')
  })

  it('does not show button when detached', function () {
    window.metaAttributesCache.set('ol-detachRole', 'detacher')

    cy.mount(
      <EditorProviders
        layoutContext={{ view: 'editor', pdfLayout: 'flat', chatIsOpen: false }}
      >
        <SwitchToPDFButton />
      </EditorProviders>
    )

    cy.findByRole('button', { name: 'Switch to PDF' }).should('not.exist')
  })
})
