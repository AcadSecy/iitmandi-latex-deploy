import { EditorProviders } from '../../../helpers/editor-providers'
import SwitchToEditorButton from '@/features/pdf-preview/components/switch-to-editor-button'

describe('<SwitchToEditorButton />', function () {
  for (const width of [360, 390, 767, 768, 1440]) {
    it(`preserves the desktop shortcut only at desktop widths (${width}px)`, function () {
      cy.viewport(width, 844)
      cy.mount(
        <EditorProviders
          layoutContext={{ view: 'pdf', pdfLayout: 'flat', chatIsOpen: false }}
        >
          <div className="ide-redesign-main">
            <SwitchToEditorButton />
          </div>
        </EditorProviders>
      )

      cy.contains('button', 'Switch to editor').should(
        width < 768 ? 'not.be.visible' : 'be.visible'
      )
    })
  }

  it('shows button in full screen pdf layout', function () {
    cy.mount(
      <EditorProviders
        layoutContext={{ view: 'pdf', pdfLayout: 'flat', chatIsOpen: false }}
      >
        <SwitchToEditorButton />
      </EditorProviders>
    )

    cy.findByRole('button', { name: 'Switch to editor' })
  })

  it('does not show button in split screen layout', function () {
    cy.mount(
      <EditorProviders
        layoutContext={{
          view: 'pdf',
          pdfLayout: 'sideBySide',
          chatIsOpen: false,
        }}
      >
        <SwitchToEditorButton />
      </EditorProviders>
    )

    cy.findByRole('button', { name: 'Switch to editor' }).should('not.exist')
  })

  it('does not show button when detached', function () {
    window.metaAttributesCache.set('ol-detachRole', 'detacher')

    cy.mount(
      <EditorProviders
        layoutContext={{
          view: 'pdf',
          pdfLayout: 'flat',
          chatIsOpen: false,
        }}
      >
        <SwitchToEditorButton />
      </EditorProviders>
    )

    cy.findByRole('button', { name: 'Switch to editor' }).should('not.exist')
  })
})
