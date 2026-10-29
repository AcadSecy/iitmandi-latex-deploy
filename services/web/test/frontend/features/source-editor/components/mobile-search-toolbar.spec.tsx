import {
  EditorProviders,
  makeEditorPropertiesProvider,
} from '../../../helpers/editor-providers'
import CodeMirrorEditor from '@/features/source-editor/components/codemirror-editor'
import { mockScope } from '../helpers/mock-scope'
import { TestContainer } from '../helpers/test-container'

function mountEditor(visual: boolean) {
  cy.mount(
    <TestContainer
      style={{ width: '100%', height: 785 }}
      className="ide-redesign-main"
    >
      <EditorProviders
        scope={mockScope('A searchable document')}
        projectFeatures={{ trackChangesVisible: true }}
        providers={{
          EditorPropertiesProvider: makeEditorPropertiesProvider({
            showVisual: visual,
            showSymbolPalette: false,
          }),
        }}
      >
        <CodeMirrorEditor />
      </EditorProviders>
    </TestContainer>
  )
  cy.get('.cm-content').should('have.css', 'opacity', '1')
}

describe('Search in the real CodeMirror toolbar', function () {
  beforeEach(function () {
    window.metaAttributesCache.set('ol-preventCompileOnLoad', true)
    window.metaAttributesCache.set('ol-splitTestVariants', {
      'writefull-toolbar-migration': 'enabled',
    })
    cy.interceptEvents()
    cy.interceptMetadata()
  })

  for (const width of [360, 390]) {
    for (const visual of [false, true]) {
      it(`keeps Search reachable at ${width}px in ${visual ? 'Visual' : 'Code'} mode`, function () {
        cy.viewport(width, 844)
        mountEditor(visual)
        cy.get('.ol-cm-toolbar [data-overflow="search"]')
          .should('exist')
          .then(group => {
            if (group.hasClass('overflow-hidden')) {
              cy.findByRole('button', { name: 'More editor toolbar items' })
                .should('be.visible')
                .then(button => {
                  const bounds = button[0].getBoundingClientRect()
                  expect(bounds.left).to.be.at.least(0)
                  expect(bounds.right).to.be.at.most(width)
                })
                .click()
              cy.get('#popover-toolbar-overflow').within(() => {
                cy.findByRole('button', { name: 'Search file' })
                  .should('be.visible')
                  .click()
              })
            } else {
              cy.findByRole('button', { name: 'Search file' })
                .should('be.visible')
                .then(button => {
                  expect(button[0].getBoundingClientRect().right).to.be.at.most(
                    width
                  )
                })
                .click()
            }
          })
        cy.findByRole('search').should('be.visible')
        cy.get('body').then(body => {
          expect(body[0].scrollWidth).to.be.at.most(width)
        })
      })
    }
  }

  it('keeps the desktop Search control directly available', function () {
    cy.viewport(1440, 900)
    mountEditor(false)
    cy.get('.ol-cm-toolbar [data-overflow="search"]').should(
      'not.have.class',
      'overflow-hidden'
    )
    cy.findByRole('button', { name: 'Search file' })
      .should('be.visible')
      .click()
    cy.findByRole('search').should('be.visible')
  })
})
