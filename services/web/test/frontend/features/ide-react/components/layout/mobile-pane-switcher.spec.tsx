import { EditorProviders } from '../../../../helpers/editor-providers'
import { LayoutProvider } from '@/shared/context/layout-context'
import MobilePaneSwitcher from '@/features/ide-react/components/layout/mobile-pane-switcher'
import { useMobileEditorLayout } from '@/features/ide-react/hooks/use-mobile-editor-layout'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'

function MobileLayoutHarness() {
  const { pane, setPane, isMobile } = useMobileEditorLayout()
  return (
    <div
      className="ide-redesign-main"
      data-mobile-pane={isMobile ? pane : undefined}
      style={{ height: 400 }}
    >
      {isMobile && <MobilePaneSwitcher pane={pane} onSelect={setPane} />}
      <output>{pane}</output>
      <PanelGroup direction="horizontal" className="ide-redesign-inner">
        <Panel className="mobile-files-panel" defaultSize={15}>
          Files content
        </Panel>
        <PanelResizeHandle />
        <Panel className="mobile-editor-and-pdf-panel">
          <PanelGroup direction="horizontal">
            <Panel className="mobile-code-panel">Code content</Panel>
            <PanelResizeHandle />
            <Panel className="ide-redesign-pdf-container">PDF content</Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  )
}

describe('Mobile pane selection', function () {
  it('defaults to Code and switches between PDF, Files and Code', function () {
    cy.viewport(390, 844)
    cy.mount(
      <EditorProviders providers={{ LayoutProvider }}>
        <MobileLayoutHarness />
      </EditorProviders>
    )

    cy.findByRole('button', { name: 'Code' }).should(
      'have.attr',
      'aria-pressed',
      'true'
    )
    cy.contains('Code content').should('be.visible')
    cy.contains('Files content').should('not.be.visible')
    cy.contains('PDF content').should('not.be.visible')
    for (const label of ['PDF', 'Files', 'Code']) {
      cy.findByRole('button', { name: label }).click()
      cy.findByRole('button', { name: label }).should(
        'have.attr',
        'aria-pressed',
        'true'
      )
      cy.get('output').should('have.text', label.toLowerCase())
      cy.get('[aria-pressed="true"]').should('have.length', 1)
      cy.contains(`${label} content`).should('be.visible')
      for (const other of ['PDF', 'Files', 'Code'].filter(
        other => other !== label
      )) {
        cy.contains(`${other} content`).should('not.be.visible')
        cy.contains(`${other} content`).should('exist')
      }
      cy.findByRole('button', { name: label }).then(button => {
        expect(button[0].getBoundingClientRect().height).to.be.at.least(44)
        expect(button[0].getBoundingClientRect().width).to.be.at.least(44)
      })
      cy.get('.ide-redesign-inner').then(group => {
        cy.contains(`${label} content`).then(panel => {
          expect(panel[0].getBoundingClientRect().width).to.be.closeTo(
            group[0].getBoundingClientRect().width,
            1
          )
        })
      })
    }
  })

  it('only shows the switcher below 768px, without resetting selection', function () {
    cy.viewport(768, 844)
    cy.mount(
      <EditorProviders providers={{ LayoutProvider }}>
        <MobileLayoutHarness />
      </EditorProviders>
    )
    cy.findByRole('group', { name: 'Layout options' }).should('not.exist')
    cy.contains('Files content').should('be.visible')
    cy.contains('Code content').should('be.visible')
    cy.contains('PDF content').should('be.visible')

    cy.viewport(767, 844)
    cy.findByRole('button', { name: 'Files' }).click()
    cy.viewport(1024, 844)
    cy.findByRole('group', { name: 'Layout options' }).should('not.exist')
    cy.get('output').should('have.text', 'files')

    cy.viewport(390, 844)
    cy.findByRole('button', { name: 'Files' }).should(
      'have.attr',
      'aria-pressed',
      'true'
    )
  })

  it('supports keyboard activation', function () {
    cy.viewport(390, 844)
    cy.mount(
      <EditorProviders providers={{ LayoutProvider }}>
        <MobileLayoutHarness />
      </EditorProviders>
    )
    cy.findByRole('button', { name: 'PDF' }).focus().type('{enter}')
    cy.get('output').should('have.text', 'pdf')
  })
})
