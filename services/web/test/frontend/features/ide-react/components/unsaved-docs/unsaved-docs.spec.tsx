import { UnsavedDocs } from '@/features/ide-react/components/unsaved-docs/unsaved-docs'
import { UnsavedDocsContext } from '@/features/ide-react/context/unsaved-docs-context'
import { GlobalAlertsProvider } from '@/features/ide-react/context/global-alerts-context'
import { FileTreePathContext } from '@/features/file-tree/contexts/file-tree-path'
import { ConnectionContext } from '@/features/ide-react/context/connection-context'
import { SplitTestProvider } from '@/shared/context/split-test-context'
import { EditorManagerContext } from '@/features/ide-react/context/editor-manager-context'
import { IdeReactContext } from '@/features/ide-react/context/ide-react-context'
import type { SinonStub } from 'sinon'

const defaultUnsavedDocsContextValue = {
  unsavedDocs: new Map<string, number>([['doc1', 16]]),
  isLocked: false,
  isSavingStalled: false,
}

const mockSocket = {
  socket: { transport: { name: 'websocket' } },
} as any

const mockConnectionContextValue = {
  socket: mockSocket,
  connectionState: { readyState: WebSocket.OPEN },
  isConnected: true,
  isStillReconnecting: false,
  secondsUntilReconnect: () => 0,
  tryReconnectNow: () => {},
  registerUserActivity: () => {},
  closeConnection: () => {},
  getSocketDebuggingInfo: () => ({ id: '' }),
} as any

const mockFileTreePathContextValue = {
  dirname: () => '',
  pathInFolder: (docId: string) => (docId === 'doc1' ? 'main.tex' : null),
  findEntityByPath: (path: string) =>
    path === 'main.tex'
      ? { entity: { _id: 'doc1', name: 'main.tex' }, type: 'doc' as const }
      : null,
  previewByPath: () => null,
}

const mockEditorManagerContextValue = {
  openDocs: {
    getUnsavedOpsSize: () => ({ pendingOpsLength: 2, inflightOpsLength: 1 }),
    getUnsavedSnapshot: () => undefined,
  },
} as any

const mount = ({
  unsavedDocsContextValue = defaultUnsavedDocsContextValue,
  reportError = cy.stub(),
  isConnected = true,
  getUnsavedSnapshot = () => undefined,
}: {
  unsavedDocsContextValue?: typeof defaultUnsavedDocsContextValue
  reportError?: any
  isConnected?: boolean
  getUnsavedSnapshot?: (docId: string) => string | undefined
} = {}) => {
  const ideReactContextValue = { reportError } as any
  cy.mount(
    <SplitTestProvider>
      <GlobalAlertsProvider>
        <ConnectionContext.Provider
          value={{ ...mockConnectionContextValue, isConnected }}
        >
          <IdeReactContext.Provider value={ideReactContextValue}>
            <EditorManagerContext.Provider
              value={{
                ...mockEditorManagerContextValue,
                openDocs: {
                  ...mockEditorManagerContextValue.openDocs,
                  getUnsavedSnapshot,
                },
              }}
            >
              <FileTreePathContext.Provider
                value={mockFileTreePathContextValue}
              >
                <UnsavedDocsContext.Provider value={unsavedDocsContextValue}>
                  <UnsavedDocs />
                </UnsavedDocsContext.Provider>
              </FileTreePathContext.Provider>
            </EditorManagerContext.Provider>
          </IdeReactContext.Provider>
        </ConnectionContext.Provider>
      </GlobalAlertsProvider>
    </SplitTestProvider>
  )
}

const enableFlag = () => {
  cy.window().then(win => {
    win.metaAttributesCache.set('ol-splitTestVariants', {
      'intermittent-connection-improvements': 'enabled',
    })
  })
}

describe('<UnsavedDocs />', function () {
  it('shows UnsavedDocsAlert when flag is disabled', function () {
    mount()
    cy.findByRole('alert').should('exist')
  })

  it('suppresses UnsavedDocsAlert when flag is enabled', function () {
    enableFlag()
    mount()
    cy.findByRole('alert').should('not.exist')
  })

  it('downloads the current buffered source while disconnected', function () {
    const source = '\\section{Unsaved नमस्ते}'
    cy.viewport(390, 844)
    mount({
      isConnected: false,
      getUnsavedSnapshot: docId => (docId === 'doc1' ? source : undefined),
      unsavedDocsContextValue: {
        ...defaultUnsavedDocsContextValue,
        unsavedDocs: new Map([['doc1', 1]]),
      },
    })
    cy.window().then(win => {
      cy.stub(win.URL, 'createObjectURL').returns('blob:local').as('createObjectURL')
      cy.stub(win.URL, 'revokeObjectURL')
      cy.stub(win.HTMLAnchorElement.prototype, 'click').as('downloadFile')
    })
    cy.findByRole('alert').should('contain.text', 'Changes to main.tex are waiting to sync.')
    cy.findByRole('button', { name: 'Download local copy of main.tex' }).focus()
    cy.screenshot('unsaved-source-phone', { capture: 'viewport' })
    cy.findByRole('button', { name: 'Download local copy of main.tex' }).click()
    cy.get('@downloadFile')
      .should('have.been.calledOnce')
      .then(click => {
        const link = (click as unknown as SinonStub).firstCall.thisValue
        expect(link.download).to.equal('unsaved-main.tex')
      })
    cy.get('@createObjectURL')
      .should('have.been.calledOnce')
      .then(create => {
        const blob: Blob = (create as unknown as SinonStub).firstCall.args[0]
        return blob.text().then(text => {
          expect(text).to.equal(source)
        })
      })
  })

  it('does not offer a download for a document with no buffered source', function () {
    mount({ isConnected: false })
    cy.findByRole('alert').should('exist')
    cy.findByRole('button', { name: /download local copy/i }).should('not.exist')
  })

  it('offers recovery when the enhanced connection mode stalls', function () {
    enableFlag()
    mount({
      isConnected: false,
      getUnsavedSnapshot: () => 'waiting to sync',
      unsavedDocsContextValue: {
        ...defaultUnsavedDocsContextValue,
        isSavingStalled: true,
      },
    })
    cy.findByRole('button', { name: 'Download local copy of main.tex' }).should('be.visible')
  })

  describe('when locked', function () {
    const lockedContextValue = {
      unsavedDocs: new Map<string, number>(),
      isLocked: true,
      isSavingStalled: false,
    }

    it('shows the locked alert and reports the error when flag is disabled', function () {
      const reportError = cy.stub().as('reportError')
      mount({ unsavedDocsContextValue: lockedContextValue, reportError })
      cy.findByRole('alert').should('exist')
      cy.get('@reportError').should(
        'have.been.calledOnceWith',
        'connection-lost-with-unsaved-changes',
        { pendingOpsLength: 2, inflightOpsLength: 1 }
      )
    })

    it('hides the locked alert but still reports the error when flag is enabled', function () {
      const reportError = cy.stub().as('reportError')
      enableFlag()
      mount({ unsavedDocsContextValue: lockedContextValue, reportError })
      cy.findByRole('alert').should('not.exist')
      cy.get('@reportError').should(
        'have.been.calledOnceWith',
        'connection-lost-with-unsaved-changes',
        { pendingOpsLength: 2, inflightOpsLength: 1 }
      )
    })
  })
})
