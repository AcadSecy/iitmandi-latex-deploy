import { EditorView } from '@codemirror/view'
import MainLayout from '@/features/ide-react/components/layout/main-layout'
import {
  LayoutProvider,
  useLayoutContext,
} from '@/shared/context/layout-context'
import { EditorProviders } from '../../../../helpers/editor-providers'
import { withTestContainerErrorBoundary } from '../../../../helpers/error-boundary'
import { updates } from '../../../history/fixtures/updates'
import { labels } from '../../../history/fixtures/labels'

function HistoryLayout() {
  const { setView } = useLayoutContext()
  return (
    <>
      <button onClick={() => setView('history')}>Open History</button>
      <div style={{ height: 'calc(100vh - 44px)' }}>
        <MainLayout />
      </div>
    </>
  )
}

const TestLayout = withTestContainerErrorBoundary(HistoryLayout)

function openHistory() {
  cy.mount(
    <EditorProviders
      providers={{ LayoutProvider }}
      projectFeatures={{ versioning: true }}
    >
      <TestLayout />
    </EditorProviders>
  )
  cy.findByRole('button', { name: 'Open History', exact: true }).click()
  cy.wait(['@updates', '@labels', '@fileDiff', '@docDiff'])
  cy.get('.history-react .cm-content').should(
    'contain.text',
    'History document'
  )
}

function selectPane(name: 'Files' | 'Diff' | 'Versions') {
  cy.findByRole('group', { name: 'History', exact: true }).within(() => {
    cy.findByRole('button', { name, exact: true }).click()
    cy.findByRole('button', { name, exact: true }).should(
      'have.attr',
      'aria-pressed',
      'true'
    )
  })
}

function panelPreferences(storage: Storage) {
  return Object.fromEntries(
    Object.keys(storage)
      .filter(key =>
        [
          'react-resizable-panels:ide-redesign-outer-layout',
          'react-resizable-panels:ide-redesign-editor-and-pdf-panel-group',
        ].includes(key)
      )
      .map(key => [key, storage.getItem(key)])
  )
}

describe('Responsive History in MainLayout', function () {
  beforeEach(function () {
    window.metaAttributesCache.set('ol-preventCompileOnLoad', true)
    cy.interceptEvents()
    cy.interceptMetadata()
    cy.intercept('GET', '/project/*/updates*', { body: updates }).as('updates')
    cy.intercept('GET', '/project/*/labels', { body: labels }).as('labels')
    cy.intercept('GET', '/project/*/filetree/diff*', {
      body: { diff: [{ pathname: 'main.tex' }, { pathname: 'name.tex' }] },
    }).as('fileDiff')
    cy.intercept('GET', '/project/*/diff?*', req => {
      const pathname = new URL(req.url).searchParams.get('pathname')
      req.reply({
        body: {
          diff: [
            { u: `History document for ${pathname}\n` },
            { i: 'Added in this revision\n', meta: updates.updates[0].meta },
          ],
        },
      })
    }).as('docDiff')
  })

  for (const width of [360, 390, 767]) {
    it(`shows one full-width pane and retains History state at ${width}px`, function () {
      cy.viewport(width, 844)
      openHistory()
      cy.findByRole('button', { name: 'Versions', exact: true }).should(
        'have.attr',
        'aria-pressed',
        'true'
      )
      cy.get('.change-list').should('be.visible')
      cy.get('.doc-panel').should('not.be.visible')
      cy.get('#history-file-tree').should('not.be.visible')
      cy.get('[data-testid="history-version"]').first().as('firstVersion')
      cy.window()
        .should(win => {
          expect(
            Object.keys(panelPreferences(win.localStorage))
          ).to.have.length(2)
        })
        .then(win => {
          const sizes = panelPreferences(win.localStorage)
          selectPane('Files')
          cy.get('#history-file-tree').should('be.visible')
          cy.get('.change-list').should('not.be.visible')
          cy.findByRole('treeitem', { name: 'main.tex', exact: true }).click()
          cy.wait('@docDiff')
          selectPane('Diff')
          cy.get('#history-file-tree').should('not.be.visible')
          cy.get('.doc-panel').should('be.visible')
          cy.get('.history-react-toolbar-file-info').should(
            'contain.text',
            'main.tex'
          )
          cy.get('.history-react .cm-content')
            .should('be.visible')
            .and('contain.text', 'History document for main.tex')
          cy.get('.history-react .ol-cm-addition-marker').should(
            'contain.text',
            'Added in this revision'
          )
          cy.get('.history-react .cm-editor').then(editor => {
            const originalEditor = EditorView.findFromDOM(editor[0])
            expect(originalEditor).not.to.equal(null)
            originalEditor!.dispatch({ selection: { anchor: 4 } })
            selectPane('Versions')
            cy.get('@firstVersion').should('be.visible')
            selectPane('Files')
            cy.findByRole('treeitem', { name: 'main.tex', exact: true }).should(
              'have.attr',
              'aria-selected',
              'true'
            )
            selectPane('Diff')
            cy.get('.history-react .cm-editor').then(current => {
              const revealedEditor = EditorView.findFromDOM(current[0])
              expect(revealedEditor).to.equal(originalEditor)
              expect(revealedEditor!.state.selection.main.anchor).to.equal(4)
            })
          })
          cy.window().then(current => {
            expect(panelPreferences(current.localStorage)).to.deep.equal(sizes)
          })
        })
      for (const name of ['Files', 'Diff', 'Versions'] as const) {
        selectPane(name)
        const panes = {
          Files: '#history-file-tree',
          Diff: '.doc-panel',
          Versions: '.change-list',
        }
        for (const [label, pane] of Object.entries(panes)) {
          cy.get(pane).should(label === name ? 'be.visible' : 'not.be.visible')
        }
        const selector =
          name === 'Files'
            ? '.mobile-files-panel'
            : name === 'Diff'
              ? '.doc-panel'
              : '.change-list'
        cy.get('.ide-redesign-inner').then(body => {
          cy.get(selector).then(panel => {
            expect(panel[0].getBoundingClientRect().width).to.be.closeTo(
              body[0].getBoundingClientRect().width,
              2
            )
          })
        })
      }
      cy.document().then(doc => {
        expect(doc.documentElement.scrollWidth).to.be.at.most(width)
      })
    })
  }

  it('keeps a selected revision while moving between History panes', function () {
    cy.viewport(390, 844)
    openHistory()
    cy.findAllByTestId('history-version-details').eq(1).click()
    cy.wait(['@fileDiff', '@docDiff'])
    cy.findAllByTestId('history-version-details')
      .eq(1)
      .should('have.attr', 'data-selected', 'selected')
    selectPane('Files')
    selectPane('Diff')
    selectPane('Versions')
    cy.findAllByTestId('history-version-details')
      .eq(1)
      .should('have.attr', 'data-selected', 'selected')
  })

  it('preserves a comparison range while switching panes', function () {
    cy.viewport(390, 844)
    openHistory()
    cy.findAllByTestId('history-version-details')
      .eq(3)
      .within(() => {
        cy.findByRole('button', {
          name: 'Compare from this version',
          exact: true,
        }).click()
      })
    cy.wait(['@fileDiff', '@docDiff'])
    cy.findAllByTestId('history-version-details')
      .should(versions => {
        const states = [...versions].map(version => version.dataset.selected)
        expect(states).to.include('upperSelected')
        expect(states).to.include('lowerSelected')
      })
      .then(versions => {
        const states = [...versions].map(version => version.dataset.selected)
        selectPane('Files')
        selectPane('Diff')
        cy.get('.history-react-toolbar-datetime').should(
          'contain.text',
          'Comparing from'
        )
        selectPane('Versions')
        cy.findAllByTestId('history-version-details').should(current => {
          expect(
            [...current].map(version => version.dataset.selected)
          ).to.deep.equal(states)
        })
      })
  })

  it('preserves timeline scrolling across pane switches and loads another page', function () {
    cy.viewport(390, 400)
    cy.intercept('GET', '/project/*/updates*', req => {
      if (req.query.before) {
        req.alias = 'moreUpdates'
        req.reply({ body: { updates: updates.updates.slice(3) } })
      } else {
        req.reply({
          body: {
            updates: updates.updates.slice(0, 3),
            nextBeforeTimestamp: 123,
          },
        })
      }
    }).as('updates')
    openHistory()
    cy.get('.history-all-versions-scroller')
      .should(scroller => {
        expect(scroller[0].clientHeight).to.be.greaterThan(0)
        expect(scroller[0].scrollHeight).to.be.greaterThan(
          scroller[0].clientHeight
        )
      })
      .scrollTo('bottom')
    cy.wait('@moreUpdates').its('request.query.before').should('eq', '123')
    cy.findAllByTestId('history-version-details').should(
      'have.length',
      updates.updates.length
    )
    cy.get('.history-all-versions-scroller')
      .scrollTo('bottom')
      .then(scroller => {
        const element = scroller[0]
        const scrollTop = element.scrollTop
        expect(scrollTop).to.be.greaterThan(0)
        selectPane('Files')
        selectPane('Versions')
        cy.get('.history-all-versions-scroller').should(revealed => {
          expect(revealed[0]).to.equal(element)
          expect(revealed[0].scrollTop).to.be.closeTo(scrollTop, 1)
        })
      })
  })

  it('retains the desktop layout at 768px and restores mobile selection on resize', function () {
    cy.viewport(767, 844)
    openHistory()
    selectPane('Files')
    for (const width of [768, 1440]) {
      cy.viewport(width, 900)
      cy.findByRole('group', { name: 'History', exact: true }).should(
        'not.exist'
      )
      cy.get('#history-file-tree').should('be.visible')
      cy.get('.doc-panel').should('be.visible')
      cy.get('.change-list').should('be.visible')
    }
    cy.viewport(767, 844)
    cy.findByRole('button', { name: 'Files', exact: true }).should(
      'have.attr',
      'aria-pressed',
      'true'
    )
  })

  it('supports keyboard activation and resets to Versions after Back to Editor', function () {
    cy.viewport(390, 844)
    openHistory()
    cy.findByRole('button', { name: 'Diff', exact: true })
      .focus()
      .type('{enter}')
    cy.get('.doc-panel').should('be.visible')
    cy.findByRole('button', { name: 'Back to editor', exact: true }).click()
    cy.get('.mobile-history-pane-switcher').should('not.exist')
    cy.findByRole('button', { name: 'Files', exact: true }).click()
    cy.findByRole('button', { name: 'Files', exact: true }).should(
      'have.attr',
      'aria-pressed',
      'true'
    )
    cy.findByRole('button', { name: 'PDF', exact: true }).click()
    cy.findByRole('button', { name: 'PDF', exact: true }).should(
      'have.attr',
      'aria-pressed',
      'true'
    )
    cy.findByRole('button', { name: 'Code', exact: true }).click()
    cy.findByRole('button', { name: 'Open History', exact: true }).click()
    cy.findByRole('button', { name: 'Versions', exact: true }).should(
      'have.attr',
      'aria-pressed',
      'true'
    )
  })
})
