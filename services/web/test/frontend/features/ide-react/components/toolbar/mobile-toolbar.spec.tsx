import { Toolbar } from '@/features/ide-react/components/toolbar/toolbar'
import { LayoutProvider } from '@/shared/context/layout-context'
import { EditorProviders } from '../../../../helpers/editor-providers'
import { useMobileEditorLayout } from '@/features/ide-react/hooks/use-mobile-editor-layout'
import { useCommandProvider } from '@/features/ide-react/hooks/use-command-provider'

function RealToolbar() {
  const { isMobile } = useMobileEditorLayout()
  return (
    <div className="ide-redesign-main">
      <Toolbar mobile={isMobile} />
    </div>
  )
}

function EditorCommands({ run }: { run: (id: string) => void }) {
  useCommandProvider(
    () => [
      { id: 'undo', label: 'Undo', handler: () => run('undo') },
      {
        id: 'insert-link',
        label: 'Insert link',
        handler: () => run('insert-link'),
      },
      { id: 'format-bold', label: 'Bold', handler: () => run('format-bold') },
      {
        id: 'insert-inline-math',
        label: 'Inline math',
        handler: () => run('insert-inline-math'),
      },
      {
        id: 'format-style-section',
        label: 'Section',
        handler: () => run('format-style-section'),
      },
    ],
    [run]
  )
  return null
}

function mountToolbar() {
  const run = cy.stub().as('command')
  cy.mount(
    <EditorProviders
      providers={{ LayoutProvider }}
      projectName="Mobile test project"
    >
      <EditorCommands run={run} />
      <RealToolbar />
    </EditorProviders>
  )
}

describe('Real project Toolbar on phones', function () {
  for (const width of [360, 375]) {
    it(`groups project actions in a single-row toolbar at ${width}px`, function () {
      cy.viewport(width, 844)
      mountToolbar()
      cy.findByRole('button', { name: 'Project actions', exact: true }).then(
        actions => {
          const bounds = actions[0].getBoundingClientRect()
          cy.findByRole('button', { name: 'Help', exact: true }).then(help => {
            expect(bounds.top).to.be.closeTo(
              help[0].getBoundingClientRect().top,
              1
            )
          })
          expect(bounds.right).to.be.at.most(width)
        }
      )
      cy.findByRole('button', { name: 'More options' }).click()
      cy.findByRole('menuitem', { name: 'Undo', exact: true }).should(
        'be.visible'
      )
      cy.findByRole('button', { name: 'Project actions', exact: true }).click()
      cy.findByRole('menuitem', { name: 'Undo', exact: true }).should(
        'not.exist'
      )
      cy.findByRole('menuitem', { name: 'History', exact: true }).should(
        'be.visible'
      )
      cy.findByRole('menuitem', { name: 'Share', exact: true })
        .should('be.visible')
        .then(item => {
          expect(item[0].getBoundingClientRect().height).to.be.at.least(44)
        })
      cy.findByRole('menuitem', { name: 'Layout options', exact: true }).click()
      cy.findByRole('menuitem', { name: 'Layout options', exact: true }).should(
        'have.attr',
        'aria-expanded',
        'true'
      )
      cy.get('#mobile-inline-layout-options').then(options => {
        cy.findByRole('menuitem', { name: 'Share', exact: true }).then(
          share => {
            expect(share[0].getBoundingClientRect().top).to.be.at.least(
              options[0].getBoundingClientRect().bottom
            )
          }
        )
      })
      cy.findByRole('menuitem', { name: 'Editor only', exact: true }).then(
        item => {
          const bounds = item[0].getBoundingClientRect()
          expect(bounds.left).to.be.at.least(0)
          expect(bounds.right).to.be.at.most(width)
        }
      )
      cy.findByRole('menuitem', { name: 'Layout options', exact: true }).click()
      cy.get('#mobile-inline-layout-options').should('not.exist')
      cy.findByRole('menuitem', { name: 'Layout options', exact: true })
        .focus()
        .type('{enter}')
      cy.get('#mobile-inline-layout-options').should('be.visible')
      cy.findByRole('menuitem', { name: 'Editor only', exact: true })
        .focus()
        .type('{esc}')
      cy.get('#mobile-project-actions').should(
        'have.attr',
        'aria-expanded',
        'false'
      )
      cy.document().then(document => {
        expect(document.documentElement.scrollWidth).to.be.at.most(width)
      })
    })
  }

  it('opens Share through the narrow project menu', function () {
    cy.viewport(360, 844)
    mountToolbar()
    cy.findByRole('button', { name: 'Project actions', exact: true }).click()
    cy.findByRole('menuitem', { name: 'Share', exact: true }).click()
    cy.findByRole('dialog').should('be.visible')
  })

  it('opens History through the narrow project menu', function () {
    cy.viewport(360, 844)
    mountToolbar()
    cy.findByRole('button', { name: 'Project actions', exact: true }).click()
    cy.findByRole('menuitem', { name: 'History', exact: true }).click()
    cy.get('.mobile-compact-project-toolbar').should('not.exist')
  })

  for (const width of [390, 767]) {
    it(`keeps direct actions and complete command access at ${width}px`, function () {
      cy.viewport(width, 844)
      mountToolbar()
      for (const name of [
        'File',
        'View',
        'Help',
        'History',
        'Layout options',
        'Share',
        'More options',
      ]) {
        cy.findByRole('button', { name, exact: true })
          .should('be.visible')
          .then(button => {
            const bounds = button[0].getBoundingClientRect()
            expect(bounds.left).to.be.at.least(0)
            expect(bounds.right).to.be.at.most(width)
          })
      }
      cy.findByRole('button', { name: 'Help', exact: true }).then(help => {
        cy.findByRole('button', { name: 'More options' }).then(trigger => {
          const helpBounds = help[0].getBoundingClientRect()
          const triggerBounds = trigger[0].getBoundingClientRect()
          expect(triggerBounds.top).to.be.closeTo(helpBounds.top, 1)
          expect(triggerBounds.left).to.be.at.least(helpBounds.right)
        })
      })
      cy.document().then(document => {
        expect(document.documentElement.scrollWidth).to.be.at.most(width)
      })
      cy.get('.mobile-toolbar-direct-actions').within(() => {
        for (const name of ['History', 'Layout options', 'Share']) {
          cy.findByRole('button', { name, exact: true }).then(button => {
            expect(button[0].getBoundingClientRect().height).to.be.at.least(44)
          })
        }
      })
      for (const name of ['Edit', 'Insert', 'Format']) {
        cy.findByRole('button', { name, exact: true }).should('not.exist')
      }
      cy.findByRole('button', { name: 'More options' }).click()
      cy.get('.mobile-toolbar-command-sections').within(() => {
        cy.get('.dropdown-header').should('not.exist')
        cy.get('.dropdown-divider').each(divider => {
          cy.wrap(divider).should('not.be.visible')
        })
        for (const [label, id] of [
          ['Undo', 'undo'],
          ['Insert link', 'insert-link'],
          ['Bold', 'format-bold'],
          ['Inline math', 'insert-inline-math'],
          ['Section', 'format-style-section'],
        ]) {
          cy.findByRole('menuitem', { name: label, exact: true }).click()
          cy.get('@command').should('have.been.calledWith', id)
        }
      })
      cy.findByRole('button', { name: 'Project title options' })
        .should('be.visible')
        .click()
      cy.findByRole('menuitem', { name: 'Rename', exact: true }).should(
        'be.visible'
      )
      cy.findByRole('button', { name: 'More options' }).click()
      cy.findByRole('button', { name: 'Layout options', exact: true }).click()
      cy.get('.layout-dropdown .dropdown-menu.show').then(menu => {
        const bounds = menu[0].getBoundingClientRect()
        expect(bounds.left).to.be.at.least(0)
        expect(bounds.right).to.be.at.most(width)
      })
      cy.findByRole('menuitem', { name: 'PDF only', exact: true }).click()
      cy.findByRole('button', { name: 'Layout options', exact: true })
        .focus()
        .type('{enter}')
      cy.findByRole('menuitem', { name: 'PDF only', exact: true })
        .should('have.attr', 'aria-current', 'true')
        .focus()
        .type('{esc}')
      cy.get('#layout-dropdown-btn').should(
        'have.attr',
        'aria-expanded',
        'false'
      )
      cy.findByRole('button', { name: 'History', exact: true }).click()
      cy.get('.back-to-editor-btn').should('be.visible').click()
      cy.get('.ide-redesign-toolbar').then(toolbar => {
        expect(toolbar[0].scrollWidth).to.be.at.most(toolbar[0].clientWidth)
      })
      cy.get('body').then(body =>
        expect(body[0].scrollWidth).to.be.at.most(width)
      )
    })
  }

  it('dismisses nested overflow content when opening an unrelated menu', function () {
    cy.viewport(390, 844)
    mountToolbar()
    cy.findByRole('button', { name: 'More options' }).click()
    cy.findByRole('button', { name: 'Project title options' }).click()
    cy.findByRole('menuitem', { name: 'Rename', exact: true }).should(
      'be.visible'
    )
    cy.findByRole('button', { name: 'Help', exact: true }).click()
    cy.get('#mobile-toolbar-actions').should(
      'have.attr',
      'aria-expanded',
      'false'
    )
    cy.findByRole('menuitem', { name: 'Rename', exact: true }).should(
      'not.exist'
    )
    cy.findByRole('menuitem', { name: 'Keyboard shortcuts', exact: true })
      .should('be.visible')
      .focus()
      .type('{esc}')
    cy.findByRole('button', { name: 'Help', exact: true }).should(
      'have.attr',
      'aria-expanded',
      'false'
    )
    cy.findByRole('button', { name: 'More options' }).click()
    cy.findByRole('button', { name: 'Project title options' }).should(
      'have.attr',
      'aria-expanded',
      'false'
    )
  })

  for (const width of [768, 1024, 1440]) {
    it(`keeps the existing desktop controls and command headings at ${width}px`, function () {
      cy.viewport(width, 900)
      mountToolbar()
      cy.findByRole('button', { name: 'More options' }).should('not.exist')
      for (const name of [
        'File',
        'Edit',
        'Insert',
        'View',
        'Format',
        'Help',
        'History',
        'Layout options',
        'Share',
        'Project title options',
      ]) {
        cy.findByRole('button', { name, exact: true }).should('be.visible')
      }
      cy.get('.mobile-compact-project-toolbar').should('not.exist')
      cy.findByRole('button', { name: 'Format', exact: true }).click()
      cy.contains('.dropdown-header', 'Paragraph styles').should('be.visible')
      cy.get('.dropdown-menu.show .dropdown-divider').should('be.visible')
      cy.findByRole('button', { name: 'Insert', exact: true }).click()
      cy.findByRole('menuitem', { name: 'Math', exact: true }).should(
        'be.visible'
      )
    })
  }
})
