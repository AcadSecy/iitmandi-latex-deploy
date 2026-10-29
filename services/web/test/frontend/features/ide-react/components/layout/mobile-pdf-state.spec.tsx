import { EditorProviders } from '../../../../helpers/editor-providers'
import {
  LayoutProvider,
  useLayoutContext,
} from '@/shared/context/layout-context'
import { useMobileEditorLayout } from '@/features/ide-react/hooks/use-mobile-editor-layout'
import MobilePaneSwitcher from '@/features/ide-react/components/layout/mobile-pane-switcher'
import PdfPreview from '@/features/pdf-preview/components/pdf-preview'
import { mockScope } from '../../../../components/pdf-preview/scope'
import { usePdfPane } from '@/features/ide-react/hooks/use-pdf-pane'

function PdfStateHarness({ withPreview = false }: { withPreview?: boolean }) {
  const { pane, setPane, isMobile } = useMobileEditorLayout()
  const layout = useLayoutContext()
  const { setPdfIsOpen } = usePdfPane()
  return (
    <>
      {isMobile && <MobilePaneSwitcher pane={pane} onSelect={setPane} />}
      <button onClick={() => layout.handleChangeLayout('flat', 'editor')}>
        Editor only
      </button>
      <button onClick={() => layout.handleChangeLayout('flat', 'pdf')}>
        PDF only
      </button>
      <button onClick={() => layout.handleChangeLayout('sideBySide')}>
        Split view
      </button>
      <button onClick={layout.handleDetach}>Detach</button>
      <button onClick={() => setPdfIsOpen(true)}>Open PDF control</button>
      <button onClick={() => layout.setView('pdf')}>
        Existing PDF control
      </button>
      <button onClick={() => layout.restoreView()}>
        Existing editor control
      </button>
      {withPreview && (
        <div style={{ position: 'relative', height: 450 }}>
          <PdfPreview />
        </div>
      )}
      <output data-testid="pane">{pane}</output>
      <output data-testid="view">{layout.view}</output>
      <output data-testid="pdf-open">{String(layout.pdfPreviewOpen)}</output>
      <output data-testid="detach-role">{layout.detachRole ?? 'none'}</output>
      <output data-testid="layout">{layout.pdfLayout}</output>
    </>
  )
}

function mount(withPreview = false) {
  cy.mount(
    <EditorProviders
      providers={{ LayoutProvider }}
      scope={withPreview ? mockScope() : undefined}
    >
      <PdfStateHarness withPreview={withPreview} />
    </EditorProviders>
  )
}

describe('Mobile PDF state with the application LayoutProvider', function () {
  beforeEach(function () {
    cy.viewport(1440, 900)
    cy.stub(window, 'open').as('openWindow')
  })

  it('opens PDF and returns to Code using existing visibility state', function () {
    cy.viewport(390, 844)
    mount()
    cy.findByRole('button', { name: 'PDF', exact: true }).click()
    cy.findByTestId('pdf-open').should('have.text', 'true')
    cy.findByTestId('view').should('have.text', 'pdf')
    cy.findByRole('button', { name: 'Code', exact: true }).click()
    cy.findByTestId('view').should('have.text', 'editor')
    cy.findByTestId('pdf-open').should('have.text', 'false')
  })

  it('opens PDF after editor-only without overwriting the desktop preference', function () {
    mount()
    cy.findByRole('button', { name: 'Editor only', exact: true }).click()
    cy.window().then(win =>
      expect(JSON.parse(win.localStorage.getItem('pdf.layout')!)).to.equal('flat')
    )
    cy.viewport(390, 844)
    cy.findByRole('button', { name: 'PDF', exact: true }).click()
    cy.findByTestId('pdf-open').should('have.text', 'true')
    cy.viewport(1440, 900)
    cy.findByTestId('view').should('have.text', 'editor')
    cy.findByTestId('layout').should('have.text', 'flat')
    cy.window().then(win =>
      expect(JSON.parse(win.localStorage.getItem('pdf.layout')!)).to.equal('flat')
    )
    cy.viewport(390, 844)
    cy.findByTestId('pane').should('have.text', 'pdf')
    cy.findByTestId('pdf-open').should('have.text', 'true')
  })

  it('reattaches a detached PDF when the phone PDF tab is selected', function () {
    mount()
    cy.findByRole('button', { name: 'Detach', exact: true }).click()
    cy.findByTestId('detach-role').should('have.text', 'detacher')
    cy.viewport(390, 844)
    cy.findByRole('button', { name: 'PDF', exact: true }).click()
    cy.findByTestId('detach-role').should('have.text', 'none')
    cy.findByTestId('pdf-open').should('have.text', 'true')
    cy.get('@openWindow').should('have.been.calledOnce')
  })

  it('reattaches and renders PDF through the existing setView control', function () {
    window.metaAttributesCache.set('ol-preventCompileOnLoad', true)
    window.metaAttributesCache.set('ol-compileSettings', {
      compileTimeout: 240,
    })
    window.metaAttributesCache.set(
      'ol-compilesUserContentDomain',
      'https://compiles-user.dev-overleaf.com'
    )
    cy.interceptEvents()
    cy.interceptCompile()
    cy.viewport(390, 844)
    mount(true)
    cy.findByRole('button', { name: 'Editor only', exact: true }).click()
    cy.findByRole('button', { name: 'Detach', exact: true }).click()
    cy.findByTestId('detach-role').should('have.text', 'detacher')
    cy.findByTestId('pdf-viewer').should('not.exist')
    cy.findByRole('button', {
      name: 'Existing PDF control',
      exact: true,
    }).click()
    cy.findByTestId('detach-role').should('have.text', 'none')
    cy.findByTestId('pane').should('have.text', 'pdf')
    cy.findByTestId('pdf-open').should('have.text', 'true')
    cy.findByTestId('pdf-viewer').should('be.visible')
    cy.findByRole('button', { name: 'Recompile', exact: true }).click()
    cy.waitForCompile({ pdf: true })
  })

  it('keeps existing layout and PDF controls in sync with phone selection', function () {
    cy.viewport(390, 844)
    mount()
    cy.findByRole('button', { name: 'Files', exact: true }).click()
    cy.findByRole('button', { name: 'PDF only', exact: true }).click()
    cy.findByTestId('pane').should('have.text', 'pdf')
    cy.findByRole('button', { name: 'Existing editor control' }).click()
    cy.findByTestId('pane').should('have.text', 'code')
    cy.findByRole('button', { name: 'Open PDF control' }).click()
    cy.findByTestId('pane').should('have.text', 'pdf')
    cy.findByRole('button', { name: 'Split view', exact: true }).click()
    cy.findByTestId('pane').should('have.text', 'code')
    cy.findByRole('button', { name: 'Detach', exact: true }).click()
    cy.findByTestId('pane').should('have.text', 'code')
  })
})
