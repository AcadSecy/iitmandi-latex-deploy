describe('Mobile editor target styles', function () {
  function mountTargets() {
    cy.mount(
      <div id="ide-root">
        <div className="global-alerts">
          <div role="alert">A connection warning</div>
        </div>
        <div className="ide-redesign-main">
          <div className="ol-cm-toolbar toolbar-editor">
            <button className="ol-cm-toolbar-button">Edit</button>
          </div>
          <div className="pdf">
            <div className="toolbar-pdf-left">
              <div className="compile-button-group">
                <button className="compile-button">Recompile</button>
                <button className="compile-dropdown-toggle">Options</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  for (const width of [360, 390]) {
    it(`allows alerts to fit and increases target height at ${width}px`, function () {
      cy.viewport(width, 844)
      mountTargets()
      cy.findByRole('alert').then(alert => {
        expect(alert[0].getBoundingClientRect().width).to.be.at.most(width)
      })
      for (const name of ['Edit', 'Recompile', 'Options']) {
        cy.findByRole('button', { name }).then(button => {
          expect(button[0].getBoundingClientRect().height).to.be.at.least(44)
        })
      }
      cy.viewport(768, 844)
      cy.findByRole('button', { name: 'Edit' }).then(button => {
        expect(button[0].getBoundingClientRect().height).to.be.lessThan(44)
      })
      cy.findByRole('alert').should('have.css', 'min-width', '400px')
    })
  }
})
