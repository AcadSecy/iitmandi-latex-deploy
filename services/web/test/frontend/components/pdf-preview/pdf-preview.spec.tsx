import localStorage from '@/infrastructure/local-storage'
import PdfPreview from '../../../../frontend/js/features/pdf-preview/components/pdf-preview'
import { EditorProviders } from '../../helpers/editor-providers'
import { mockScope } from './scope'
import {
  IdeLayout,
  IdeView,
  useLayoutContext,
} from '../../../../frontend/js/shared/context/layout-context'
import { FC, PropsWithChildren, ReactElement, useEffect } from 'react'
import { useLocalCompileContext } from '@/shared/context/local-compile-context'

const storeAndFireEvent = (win: typeof window, key: string, value: unknown) => {
  localStorage.setItem(key, value)
  win.dispatchEvent(new StorageEvent('storage', { key }))
}

const Layout: FC<{ layout: IdeLayout; view?: IdeView }> = ({
  layout,
  view,
}) => {
  const { changeLayout } = useLayoutContext()

  useEffect(() => {
    changeLayout(layout, view)
  }, [changeLayout, layout, view])

  return null
}

const PdfViewer = ({ children }: { children: ReactElement }) => {
  return <div className="pdf-viewer">{children}</div>
}

describe('<PdfPreview/>', function () {
  let projectId: string
  beforeEach(function () {
    /**
     * There are time sensitive tests in this test suite. They need to wait for a Promise before resolving a request.
     *
     * Using a promise across the test-env (browser) vs stub-env (server) causes additional latency.
     *
     * This latency seems to stack up when adding more intercepts for the same path. Using static responses for some of these intercepts does not help.
     *
     * All of that seems like a bug in Cypress. For now just work around it by using a unique projectId for each intercept.
     */
    projectId = Math.random().toString().slice(2)

    window.metaAttributesCache.set('ol-preventCompileOnLoad', true)
    window.metaAttributesCache.set(
      'ol-compilesUserContentDomain',
      'https://compiles-user.dev-overleaf.com'
    )
    window.metaAttributesCache.set('ol-canUseClsiCache', true)
    window.metaAttributesCache.set('ol-compileSettings', {
      compileTimeout: 240,
    })
    window.metaAttributesCache.set('ol-splitTestVariants', {})
    cy.interceptEvents()
  })

  it('renders the PDF preview', function () {
    window.metaAttributesCache.set('ol-preventCompileOnLoad', false)
    cy.interceptCompile()

    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <PdfViewer>
          <PdfPreview />
        </PdfViewer>
      </EditorProviders>
    )

    // wait for "compile on load" to finish
    cy.waitForCompile({ pdf: true })

    cy.findByRole('button', { name: 'Recompile' })
  })

  it('uses the cache when available', function () {
    cy.interceptCompile({
      prefix: 'compile',
      times: 1,
      cached: true,
      regular: false,
    })

    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <PdfViewer>
          <PdfPreview />
        </PdfViewer>
      </EditorProviders>
    )

    // wait for "compile from cache on load" to finish
    cy.waitForCompile({ pdf: true, cached: true, regular: false })

    cy.contains('Your Paper')
  })

  it('uses the cache when available then compiles', function () {
    cy.interceptCompile({
      prefix: 'compile',
      times: 1,
      cached: true,
      regular: false,
    })

    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <PdfViewer>
          <PdfPreview />
        </PdfViewer>
      </EditorProviders>
    )

    // wait for "compile from cache on load" to finish
    cy.waitForCompile({ pdf: true, cached: true, regular: false })
    cy.contains('Your Paper')

    // Then trigger a new compile
    cy.interceptCompile({
      prefix: 'recompile',
      times: 1,
      cached: false,
      outputPDFFixture: 'output-2.pdf',
    })

    // press the Recompile button => compile
    cy.findByRole('button', { name: 'Recompile' }).click()

    // wait for compile to finish
    cy.waitForCompile({ prefix: 'recompile', pdf: true })
    cy.contains('Modern Authoring Tools for Science')
  })

  describe('racing compile from cache and regular compile trigger', function () {
    for (const [timing] of ['before rendering', 'after rendering']) {
      it(`replaces the compile from cache with a regular compile - ${timing}`, function () {
        const requestedOnce = new Set()
        ;['log', 'pdf', 'blg'].forEach(ext => {
          cy.intercept({ pathname: `/build/*/output.${ext}` }, req => {
            if (requestedOnce.has(ext)) {
              throw new Error(
                `compile from cache triggered extra ${ext} request: ${req.url}`
              )
            }
            requestedOnce.add(ext)
            req.reply({ fixture: `build/output.${ext},null` })
          }).as(`compile-${ext}`)
        })
        const { promise, resolve } = Promise.withResolvers<void>()
        cy.interceptCompileFromCacheRequest({
          promise,
          times: 1,
        }).as('cached-compile')
        cy.interceptCompileRequest().as('compile')

        const scope = mockScope()
        cy.mount(
          <EditorProviders scope={scope} projectId={projectId}>
            <PdfViewer>
              <PdfPreview />
            </PdfViewer>
          </EditorProviders>
        )

        // press the Recompile button => compile
        cy.findByRole('button', { name: 'Recompile' }).click()

        if (timing === 'before rendering') {
          cy.then(() => resolve())
          cy.wait('@cached-compile')
        }

        // wait for rendering to finish
        cy.waitForCompile({ pdf: true, cached: false })

        if (timing === 'after rendering') {
          cy.then(() => resolve())
          cy.wait('@cached-compile')
        }

        cy.contains('Your Paper')
        cy.then(() => Array.from(requestedOnce).sort().join(',')).should(
          'equal',
          'blg,log,pdf'
        )
      })
    }
  })

  describe('clsi-cache project settings validation', function () {
    const cases = {
      // Flaky, skip for now
      'uses compile from cache when nothing changed': {
        cached: true,
        setup: () => {},
        props: {},
      },
      'ignores the compile from cache when draft mode changed': {
        cached: false,
        setup: () => {
          cy.window().then(w =>
            w.localStorage.setItem(`draft:${projectId}`, 'true')
          )
        },
        props: {},
      },
      'ignores the compile from cache when stopOnFirstError mode changed': {
        cached: false,
        setup: () => {
          cy.window().then(w =>
            w.localStorage.setItem(`stop_on_first_error:${projectId}`, 'true')
          )
        },
        props: {},
      },
      'ignores the compile from cache when png2pdf is available by default': {
        cached: false,
        setup: () => {
          cy.window().then(w =>
            w.metaAttributesCache.set('ol-canUsePng2Pdf', true)
          )
        },
        props: {},
      },
      'ignores the compile from cache when rootDoc changed': {
        cached: false,
        setup: () => {},
        props: {
          rootDocId: 'new-root-doc-id',
          rootFolder: [
            {
              _id: 'root-folder-id',
              name: 'rootFolder',
              docs: [
                {
                  _id: '_root_doc_id',
                  name: 'main.tex',
                },
                {
                  _id: 'new-root-doc-id',
                  name: 'new-main.tex',
                },
              ],
              folders: [],
              fileRefs: [],
            },
          ],
        },
      },
    }
    Object.entries(cases).forEach(([name, { cached, setup, props }]) => {
      it(name, function () {
        cy.interceptCompile({
          cached: true,
          regular: !cached,
        })

        const scope = mockScope()
        window.metaAttributesCache.set('ol-preventCompileOnLoad', false)
        setup()

        cy.mount(
          <EditorProviders scope={scope} projectId={projectId} {...props}>
            <PdfViewer>
              <PdfPreview />
            </PdfViewer>
          </EditorProviders>
        )

        // wait for compile to finish
        cy.waitForCompile({ pdf: true, cached, regular: !cached })
        cy.contains('Your Paper')
      })
    })
  })

  it('runs a compile when the Recompile button is pressed', function () {
    cy.interceptCompile()

    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <PdfViewer>
          <PdfPreview />
        </PdfViewer>
      </EditorProviders>
    )

    // press the Recompile button => compile
    cy.findByRole('button', { name: 'Recompile' }).click()

    // wait for compile to finish
    cy.waitForCompile({ pdf: true })

    cy.contains('Your Paper')
  })

  it('runs a compile on `pdf:recompile` event', function () {
    cy.interceptCompile()

    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <PdfViewer>
          <PdfPreview />
        </PdfViewer>
      </EditorProviders>
    )

    cy.window().then(win => {
      win.dispatchEvent(new CustomEvent('pdf:recompile'))
    })

    // wait for compile to finish
    cy.waitForCompile({ pdf: true })

    cy.contains('Your Paper')
  })

  it('does not compile while compiling', function () {
    let counter = 0
    cy.interceptDeferredCompile(() => counter++).then(
      resolveDeferredCompile => {
        const scope = mockScope()

        cy.mount(
          <EditorProviders scope={scope}>
            <PdfViewer>
              <PdfPreview />
            </PdfViewer>
          </EditorProviders>
        )

        // start compiling
        cy.findByRole('button', { name: 'Recompile' }).click()

        cy.findByRole('button', { name: /^Compiling… \d+ s$/ }).then(() => {
          // trigger a recompile
          cy.window().then(win => {
            win.dispatchEvent(new CustomEvent('pdf:recompile'))
          })

          // finish the original compile
          resolveDeferredCompile()

          // wait for the original compile to finish
          cy.waitForCompile().then(() => {
            // NOTE: difficult to assert that a second request won't be sent, at some point
            expect(counter).to.equal(1)
          })
        })
      }
    )
  })

  it('disables compile button while compile is running', function () {
    cy.interceptDeferredCompile().then(resolveDeferredCompile => {
      const scope = mockScope()

      cy.mount(
        <EditorProviders scope={scope}>
          <PdfViewer>
            <PdfPreview />
          </PdfViewer>
        </EditorProviders>
      )

      cy.findByRole('button', { name: 'Recompile' }).click()
      cy.findByRole('button', { name: /^Compiling… \d+ s$/ })
        .should('be.disabled')
        .then(() => resolveDeferredCompile())

      cy.waitForCompile()
      cy.findByRole('button', { name: 'Recompile' }).should('not.be.disabled')
    })
  })

  it('runs a compile on doc change if autocompile is enabled', function () {
    cy.interceptCompile()

    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <PdfViewer>
          <PdfPreview />
        </PdfViewer>
      </EditorProviders>
    )

    cy.window().then(win => {
      cy.clock()

      // switch on auto compile
      storeAndFireEvent(win, 'autocompile_enabled:project123', true)

      // fire a doc:changed event => compile
      win.dispatchEvent(new CustomEvent('doc:changed'))

      // wait enough time for the compile to start
      cy.tick(6000) // > AUTO_COMPILE_DEBOUNCE

      cy.clock().invoke('restore')
    })

    // wait for compile to finish
    cy.waitForCompile({ pdf: true })

    cy.findByRole('button', { name: 'Recompile' })
  })

  it('does not run a compile on doc change if autocompile is disabled', function () {
    cy.interceptCompile()

    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <PdfViewer>
          <PdfPreview />
        </PdfViewer>
      </EditorProviders>
    )

    cy.window().then(win => {
      cy.clock()

      // make sure auto compile is switched off
      storeAndFireEvent(win, 'autocompile_enabled:project123', false)

      // fire a doc:changed event => no compile
      win.dispatchEvent(new CustomEvent('doc:changed'))

      // wait enough time for the compile to start
      cy.tick(6000) // AUTO_COMPILE_DEBOUNCE

      cy.clock().invoke('restore')
    })

    // NOTE: difficult to assert that a request hasn't been sent
    cy.findByRole('button', { name: 'Recompile' })
  })

  it('does not run a compile on doc change if autocompile is blocked by syntax check', function () {
    cy.interceptCompile()

    const scope = mockScope()
    // enable linting in the editor
    const userSettings = { syntaxValidation: true }

    const WithLintingErrors: FC<PropsWithChildren> = ({ children }) => {
      const { setHasLintingError } = useLocalCompileContext()
      useEffect(() => setHasLintingError(true), [setHasLintingError])
      return children
    }

    cy.mount(
      <EditorProviders scope={scope} userSettings={userSettings}>
        <WithLintingErrors>
          <PdfViewer>
            <PdfPreview />
          </PdfViewer>
        </WithLintingErrors>
      </EditorProviders>
    )

    cy.window().then(win => {
      cy.clock()

      // switch on auto compile
      storeAndFireEvent(win, 'autocompile_enabled:project123', true)

      // switch on syntax checking
      storeAndFireEvent(win, 'stop_on_validation_error', true)

      // fire a doc:changed event => no compile
      win.dispatchEvent(new CustomEvent('doc:changed'))

      // wait enough time for the compile to start
      cy.tick(6000) // AUTO_COMPILE_DEBOUNCE

      cy.clock().invoke('restore')
    })

    // NOTE: difficult to assert that a request hasn't been sent
    cy.findByRole('button', { name: 'Recompile' })

    cy.findByText(
      'Your code has errors that need to be fixed before the auto-compile can run'
    )
  })

  it('does not run a compile on doc change if the PDF preview is not open', function () {
    cy.interceptCompile()

    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <Layout layout="flat" view="editor" />
        <PdfViewer>
          <PdfPreview />
        </PdfViewer>
      </EditorProviders>
    )

    cy.window().then(win => {
      cy.clock()

      // switch on auto compile
      storeAndFireEvent(win, 'autocompile_enabled:project123', true)

      // fire a doc:changed event => compile
      win.dispatchEvent(new CustomEvent('doc:changed'))

      // wait enough time for the compile to start
      cy.tick(6000) // > AUTO_COMPILE_DEBOUNCE

      cy.clock().invoke('restore')
    })

    // NOTE: difficult to assert that a request hasn't been sent
    cy.findByRole('button', { name: 'Recompile' })
  })

  describe('error messages', function () {
    const compileErrorStatuses = {
      'clear-cache':
        'Sorry, something went wrong and your project could not be compiled. Please try again in a few moments.',
      'clsi-maintenance':
        'The compile servers are down for maintenance, and will be back shortly.',
      'compile-in-progress':
        'A previous compile is still running. Please wait a minute and try compiling again.',
      exited: 'Server Error',
      failure: 'No PDF',
      generic: 'Server Error',
      'project-too-large': 'Project too large',
      'rate-limited': 'Compile rate limit hit',
      terminated: 'Compilation cancelled',
      timedout: 'Timed out',
      'too-recently-compiled':
        'This project was compiled very recently, so this compile has been skipped.',
      unavailable:
        'Sorry, the compile server for your project was temporarily unavailable. Please try again in a few moments.',
      foo: 'Sorry, something went wrong and your project could not be compiled. Please try again in a few moments.',
    }

    for (const [status, message] of Object.entries(compileErrorStatuses)) {
      it(`displays error message for '${status}' status`, function () {
        cy.intercept('POST', '/project/*/compile*', {
          body: {
            status,
            clsiServerId: 'foo',
            compileGroup: 'priority',
          },
        }).as('compile')

        const scope = mockScope()

        cy.mount(
          <EditorProviders scope={scope}>
            <PdfViewer>
              <PdfPreview />
            </PdfViewer>
          </EditorProviders>
        )

        cy.findByRole('button', { name: 'Recompile' }).click()
        cy.wait('@compile')
        cy.findByText(message)
      })
    }

    it('displays error messages expanded by default', function () {
      cy.intercept('POST', '/project/*/compile*', {
        body: {
          status: 'failure',
          clsiServerId: 'foo',
          compileGroup: 'priority',
        },
      }).as('compile')

      const scope = mockScope()

      cy.mount(
        <EditorProviders scope={scope}>
          <PdfViewer>
            <PdfPreview />
          </PdfViewer>
        </EditorProviders>
      )

      cy.findByRole('button', { name: 'Recompile' }).click()
      cy.wait('@compile')

      // The error message should be visible (expanded by default)
      cy.findByText('No PDF')
      cy.findByText(/This compile didn’t produce a PDF/)
      // The collapse button should be available (meaning it's expanded)
      cy.findByLabelText(
        'An error which prevented this project from compiling'
      ).within(() => {
        cy.findByRole('button', { name: 'Collapse' })
      })
    })
  })

  describe('after a failed compile', function () {
    const STALE_PDF =
      'The latest compile failed. This is the PDF from your last successful compile.'

    // the response for a compile that wrote only a log, as CLSI sends it
    // after dropping an unfinished PDF
    const interceptFailedCompile = () => {
      cy.intercept(
        { method: 'POST', pathname: '/project/*/compile', times: 1 },
        {
          body: {
            status: 'failure',
            clsiServerId: 'foo',
            compileGroup: 'priority',
            outputFiles: [
              {
                path: 'output.log',
                build: 'failed-build',
                url: '/build/failed-build/output.log',
                type: 'log',
              },
            ],
          },
        }
      ).as('failed-compile')
      cy.intercept(
        { pathname: '/build/failed-build/output.log', times: 1 },
        { fixture: 'build/output.log' }
      )
    }

    const mountPreview = () => {
      cy.mount(
        <EditorProviders scope={mockScope()}>
          <PdfViewer>
            <PdfPreview />
          </PdfViewer>
        </EditorProviders>
      )
    }

    it('shows the last good PDF as out of date until the next good compile', function () {
      cy.interceptCompile()
      mountPreview()
      cy.findByRole('button', { name: 'Recompile' }).click()
      cy.waitForCompile({ pdf: true })
      cy.contains('Your Paper')
      cy.findByText(STALE_PDF).should('not.exist')

      interceptFailedCompile()
      cy.findByRole('button', { name: 'Recompile' }).click()
      cy.wait('@failed-compile')
      cy.findByText('No PDF')
      cy.findByRole('button', { name: 'Back to PDF' })
        .should('be.enabled')
        .click()
      cy.contains('Your Paper')
      cy.findByText(STALE_PDF)

      cy.interceptCompile({ prefix: 'recompile' })
      cy.findByRole('button', { name: 'Recompile' }).click()
      cy.waitForCompile({ prefix: 'recompile', pdf: true })
      cy.contains('Your Paper')
      cy.findByText(STALE_PDF).should('not.exist')
    })

    it('shows the logs and no PDF when the first compile fails', function () {
      interceptFailedCompile()
      mountPreview()
      cy.findByRole('button', { name: 'Recompile' }).click()
      cy.wait('@failed-compile')
      cy.findByText('No PDF')
      cy.findByRole('button', { name: 'Back to PDF' }).should('be.disabled')
      cy.findByText(STALE_PDF).should('not.exist')
    })
  })

  describe('partial PDFs', function () {
    const banners = {
      terminated:
        'You stopped this compile. The PDF has the pages typeset before it stopped.',
      timedout:
        'This compile reached its time limit. The PDF has the pages typeset before it stopped.',
    }

    const mountPreview = function (viewer: 'native' | 'pdfjs' = 'native') {
      const scope = mockScope()
      scope.settings.pdfViewer = viewer

      cy.intercept(
        { pathname: '/project/*/output/cached/output.overleaf.json' },
        { statusCode: 404 }
      ).as('cached-compile')

      cy.mount(
        <EditorProviders
          scope={scope}
          projectId={projectId}
          userSettings={scope.settings}
        >
          <PdfViewer>
            <PdfPreview />
          </PdfViewer>
        </EditorProviders>
      )
    }

    const showInitialPdf = function () {
      cy.interceptCompile()
      mountPreview()
      cy.findByRole('button', { name: 'Recompile' }).click()
      cy.waitForCompile({ pdf: true })
      cy.findByTitle('PDF Preview').should('be.visible')
      cy.get('.new-logs-pane').should('not.be.visible')
    }

    const runPartialCompile = function (
      status: 'terminated' | 'timedout',
      { hasPdf = true, stop = false } = {}
    ) {
      const build = `partial-${status}-build`
      let compilePending = false

      const response = {
        // Keep the compile pending for Stop without a request callback Promise.
        delay: stop ? 5000 : 0,
        body: {
          status,
          clsiServerId: 'foo',
          compileGroup: 'priority',
          pdfDownloadDomain: 'https://clsi.test-overleaf.com',
          outputFiles: hasPdf
            ? [
                {
                  path: 'output.pdf',
                  build,
                  url: `/build/${build}/output.pdf`,
                  type: 'pdf',
                },
                {
                  path: 'output.log',
                  build,
                  url: `/build/${build}/output.log`,
                  type: 'log',
                },
              ]
            : [],
        },
      }

      cy.intercept(
        { method: 'POST', pathname: '/project/*/compile', times: 1 },
        req => {
          compilePending = true
          req.on('after:response', () => {
            compilePending = false
          })
          req.reply(response)
        }
      ).as('partial-compile')

      if (hasPdf) {
        cy.intercept(
          { pathname: `/build/${build}/output.pdf` },
          { fixture: 'build/output-2.pdf,null' }
        ).as('partial-compile-pdf')
        cy.intercept(
          { pathname: `/build/${build}/output.log` },
          { fixture: 'build/output.log' }
        ).as('partial-compile-log')
      }

      if (stop) {
        cy.intercept(
          { method: 'GET', pathname: '/project/*/compile/queue' },
          {
            body: {
              state: 'running',
              position: null,
              isAutoCompile: false,
              slots: 0,
            },
          }
        ).as('compile-queue')
        cy.intercept(
          { method: 'POST', pathname: '/project/*/compile/stop', times: 1 },
          req => {
            expect(compilePending, 'compile is pending at Stop').to.be.true
            req.reply({ statusCode: 200, body: {} })
          }
        ).as('stop-compile')
      }

      cy.findByRole('button', { name: 'Recompile' }).click()

      if (stop) {
        cy.wrap(null).should(() => {
          expect(compilePending, 'original compile POST is pending').to.be.true
        })
        // The loading button's accessible name includes the elapsed seconds.
        cy.findByRole('button', { name: /^Compiling… \d+ s$/ }).should(
          'be.disabled'
        )
        cy.findByRole('button', { name: 'Toggle compile options menu' }).click()
        cy.findByRole('menuitem', { name: 'Stop compilation' }).should(
          'be.enabled'
        )
        cy.findByRole('menuitem', { name: 'Stop compilation' }).trigger('click')
        cy.wait('@stop-compile').its('response.statusCode').should('eq', 200)
        // Stop finishes before the original compile POST returns its output.
        cy.findByRole('button', { name: 'Recompile' }).should('be.enabled')
      }

      cy.wait('@partial-compile')
        .its('response.body.status')
        .should('eq', status)
      if (hasPdf) {
        cy.wait('@partial-compile-log')
        cy.wait('@partial-compile-pdf')
      }
    }

    const expectPartialPdf = function (status: 'terminated' | 'timedout') {
      cy.findByTitle('PDF Preview')
        .should('be.visible')
        .and('have.attr', 'src')
        .and('include', `/build/partial-${status}-build/output.pdf?`)
      cy.findByRole('status')
        .should('be.visible')
        .and('contain.text', banners[status])
      cy.get('.new-logs-pane').should('not.be.visible')
    }

    it('shows the new partial PDF after Stop compilation with logs closed', function () {
      showInitialPdf()
      runPartialCompile('terminated', { stop: true })
      expectPartialPdf('terminated')
    })

    it('shows the new partial PDF after Stop compilation with logs open', function () {
      showInitialPdf()
      cy.findByRole('button', { name: 'View logs' }).click()
      cy.get('.new-logs-pane').should('be.visible')

      runPartialCompile('terminated', { stop: true })
      expectPartialPdf('terminated')
    })

    it('shows the new partial PDF after a time limit with logs closed', function () {
      showInitialPdf()
      runPartialCompile('timedout')
      expectPartialPdf('timedout')
    })

    for (const status of ['terminated', 'timedout'] as const) {
      it(`returns to the partial PDF from the banner's logs for '${status}'`, function () {
        showInitialPdf()
        runPartialCompile(status)
        expectPartialPdf(status)
        cy.get('.log-btn').should('be.enabled')

        cy.findByRole('status').within(() => {
          cy.findByRole('button', { name: 'View logs' }).click()
        })
        cy.get('.new-logs-pane').should('be.visible')
        cy.findByRole('button', { name: 'Back to PDF' })
          .should('be.enabled')
          .click()
        expectPartialPdf(status)
      })
    }

    it('shows cancellation logs and disables Back to PDF after a partial PDF when stopped without output files', function () {
      mountPreview('pdfjs')
      runPartialCompile('terminated', { stop: true })
      cy.findByTestId('pdfjs-viewer-inner')
        .should('be.visible')
        .find('.page')
        .should('exist')
      cy.findByText(banners.terminated).should('be.visible')
      cy.get('.new-logs-pane').should('not.be.visible')

      runPartialCompile('terminated', { hasPdf: false, stop: true })

      cy.get('.new-logs-pane')
        .should('be.visible')
        .within(() => {
          cy.findByText('Compilation cancelled').should('be.visible')
        })
      cy.get('.pdf-partial-banner').should('not.exist')
      cy.findByRole('button', { name: 'Back to PDF' }).should('be.disabled')
      cy.findByTestId('pdfjs-viewer-inner').should('not.exist')
    })

    it('shows logs and disables Back to PDF after a partial PDF when a compile fails', function () {
      mountPreview('pdfjs')
      runPartialCompile('timedout')
      cy.findByTestId('pdfjs-viewer-inner')
        .should('be.visible')
        .find('.page')
        .should('exist')
      cy.findByText(banners.timedout).should('be.visible')
      cy.get('.new-logs-pane').should('not.be.visible')

      cy.intercept(
        { method: 'POST', pathname: '/project/*/compile', times: 1 },
        {
          body: {
            status: 'failure',
            clsiServerId: 'foo',
            compileGroup: 'priority',
            outputFiles: [
              {
                path: 'output.log',
                build: 'failed-build',
                url: '/build/failed-build/output.log',
                type: 'log',
              },
            ],
          },
        }
      ).as('failed-compile')
      cy.intercept(
        { pathname: '/build/failed-build/output.log', times: 1 },
        { fixture: 'build/output.log' }
      ).as('failed-compile-log')

      cy.findByRole('button', { name: 'Recompile' }).click()
      cy.wait('@failed-compile')
      cy.wait('@failed-compile-log')
      cy.get('.new-logs-pane').should('be.visible')
      cy.findByRole('button', { name: 'Back to PDF' }).should('be.disabled')
      cy.get('.pdf-partial-banner').should('not.exist')
      cy.findByText(
        'The latest compile failed. This is the PDF from your last successful compile.'
      ).should('not.exist')
      cy.findByTestId('pdfjs-viewer-inner').should('not.exist')
    })

    it('shows cancellation logs and disables Back to PDF when stopped without output files', function () {
      mountPreview()
      cy.get('.new-logs-pane').should('not.be.visible')
      runPartialCompile('terminated', { hasPdf: false, stop: true })

      cy.get('.new-logs-pane')
        .should('be.visible')
        .within(() => {
          cy.findByText('Compilation cancelled').should('be.visible')
        })
      cy.findByTitle('PDF Preview').should('not.exist')
      cy.get('.pdf-partial-banner').should('not.exist')
      cy.findByRole('button', { name: 'Back to PDF' }).should('be.disabled')
    })
  })

  it('displays expandable raw logs', function () {
    cy.interceptCompile()

    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <PdfViewer>
          <PdfPreview />
        </PdfViewer>
      </EditorProviders>
    )

    cy.findByRole('button', { name: 'Recompile' }).click()
    cy.waitForCompile({ pdf: true })

    cy.findByRole('button', { name: 'View logs' }).click()
    cy.findByRole('button', { name: 'Back to PDF' })
    cy.findByLabelText('Raw logs from the LaTeX compiler').within(() => {
      cy.findByRole('button', { name: 'Expand' }).click()
      cy.findByRole('button', { name: 'Collapse' }).click()
    })
  })

  it('displays error messages if there were validation problems', function () {
    const validationProblems = {
      sizeCheck: {
        resources: [
          { path: 'foo/bar', kbSize: 76221 },
          { path: 'bar/baz', kbSize: 2342 },
        ],
      },
      mainFile: true,
      conflictedPaths: [
        {
          path: 'foo/bar',
        },
        {
          path: 'foo/baz',
        },
      ],
    }

    cy.intercept('POST', '/project/*/compile*', {
      body: {
        status: 'validation-problems',
        validationProblems,
        clsiServerId: 'foo',
        compileGroup: 'priority',
      },
    }).as('compile')

    const scope = mockScope()

    cy.mount(
      <EditorProviders scope={scope}>
        <PdfViewer>
          <PdfPreview />
        </PdfViewer>
      </EditorProviders>
    )

    cy.findByRole('button', { name: 'Recompile' }).click()
    cy.wait('@compile')

    cy.findByText('Project too large')
    cy.findByText('Unknown main document')
    cy.findByText('Conflicting Paths Found')
  })

  describe('clear cache', function () {
    it('sends a clear cache request when the button is pressed', function () {
      cy.interceptCompile()

      const scope = mockScope()

      cy.mount(
        <EditorProviders scope={scope}>
          <PdfViewer>
            <PdfPreview />
          </PdfViewer>
        </EditorProviders>
      )

      cy.findByRole('button', { name: 'Recompile' }).click()
      cy.waitForCompile({ pdf: true })

      cy.findByRole('button', { name: 'View logs' }).click()
      cy.findByRole('button', { name: 'Clear cached files' }).should(
        'not.be.disabled'
      )

      const { promise, resolve } = Promise.withResolvers<void>()

      cy.intercept('DELETE', '/project/*/output*', req => {
        return promise
          .then(() => Cypress.Promise.delay(100))
          .then(() => {
            req.reply({ statusCode: 204 })
          })
      }).as('clear-cache')

      // click the button
      cy.findByRole('button', { name: 'Clear cached files' }).click()
      cy.findByRole('button', { name: 'Clear cached files' }).should(
        'be.disabled'
      )
      cy.then(() => {
        resolve()
      })
      cy.wait('@clear-cache')
      cy.findByRole('button', { name: 'Clear cached files' }).should(
        'not.be.disabled'
      )
    })

    it('handle "recompile from scratch"', function () {
      cy.interceptCompile()

      const scope = mockScope()

      cy.mount(
        <EditorProviders scope={scope}>
          <PdfViewer>
            <PdfPreview />
          </PdfViewer>
        </EditorProviders>
      )

      cy.findByRole('button', { name: 'Recompile' }).click()
      cy.waitForCompile({ pdf: true })
      cy.interceptCompile({ prefix: 'recompile' })

      cy.intercept('DELETE', '/project/*/output*', {
        statusCode: 204,
        delay: 100,
      }).as('clear-cache')

      // show the logs UI
      cy.findByRole('button', { name: 'View logs' }).click()

      cy.findByRole('button', { name: 'Clear cached files' }).should(
        'not.be.disabled'
      )

      cy.interceptDeferredCompile().then(resolveDeferredCompile => {
        cy.findByRole('button', { name: 'Toggle compile options menu' }).click()

        cy.findByRole('menuitem', {
          name: 'Recompile from scratch',
        }).trigger('click')

        cy.findByRole('button', { name: 'Clear cached files' }).should(
          'be.disabled'
        )

        cy.wait('@clear-cache')

        cy.findByRole('button', { name: /^Compiling… \d+ s$/ }).then(() =>
          resolveDeferredCompile()
        )

        // wait for recompile from scratch to finish
        cy.waitForCompile({ pdf: true })

        cy.findByRole('button', { name: 'Recompile' })
      })
    })
  })

  describe('invalid URLs and broken PDFs', function () {
    it('shows an error for an invalid URL', function () {
      cy.interceptCompile()

      cy.intercept('/build/*/output.pdf*', {
        statusCode: 500,
        body: {
          message: 'something awful happened',
          code: 'AWFUL_ERROR',
        },
      }).as('compile-pdf-error')

      const scope = mockScope()

      cy.mount(
        <EditorProviders scope={scope}>
          <PdfViewer>
            <PdfPreview />
          </PdfViewer>
        </EditorProviders>
      )

      cy.findByRole('button', { name: 'Recompile' }).click()
      cy.waitForCompile()
      cy.wait('@compile-pdf-error')

      cy.contains('Something went wrong while rendering this PDF.')
      cy.contains(
        'Please try recompiling the project from scratch, and if that doesn’t help, follow our troubleshooting guide.'
      )
      cy.findByLabelText('Page 1').should('not.exist')
    })

    it('shows an error for a corrupt PDF', function () {
      cy.interceptCompile()

      cy.intercept('/build/*/output.pdf*', {
        fixture: 'build/output-corrupt.pdf,null',
      }).as('compile-pdf-corrupt')

      const scope = mockScope()

      cy.mount(
        <EditorProviders scope={scope}>
          <PdfViewer>
            <PdfPreview />
          </PdfViewer>
        </EditorProviders>
      )

      cy.findByRole('button', { name: 'Recompile' }).click()
      cy.waitForCompile()
      cy.wait('@compile-pdf-corrupt')

      cy.contains('Something went wrong while rendering this PDF.')
      cy.contains(
        'Please try recompiling the project from scratch, and if that doesn’t help, follow our troubleshooting guide.'
      )
      cy.findByLabelText('Page 1').should('not.exist')
    })
  })

  describe('human readable logs', function () {
    it('shows human readable hint for undefined reference errors', function () {
      cy.interceptCompile()

      cy.intercept('/build/*/output.log*', {
        fixture: 'build/output-human-readable.log',
      }).as('compile-log')

      const scope = mockScope()

      cy.mount(
        <EditorProviders scope={scope}>
          <PdfViewer>
            <PdfPreview />
          </PdfViewer>
        </EditorProviders>
      )

      cy.findByRole('button', { name: 'Recompile' }).click()
      cy.waitForCompile()
      cy.findByRole('button', { name: 'View logs' }).click()

      cy.findByText(
        "Reference `intorduction' on page 1 undefined on input line 11."
      )
      cy.findByText(
        "Reference `section1' on page 1 undefined on input line 13."
      )
      cy.findByText('There were undefined references.')

      cy.findAllByText(
        /You have referenced something which has not yet been labelled/
      ).should('have.length', 3)
    })

    it('does not show human readable hint when no undefined reference errors', function () {
      cy.interceptCompile()
      cy.intercept('/build/*/output.log?*', {
        fixture: 'build/output-undefined-references.log',
      }).as('compile-log')

      const scope = mockScope()

      cy.mount(
        <EditorProviders scope={scope}>
          <PdfViewer>
            <PdfPreview />
          </PdfViewer>
        </EditorProviders>
      )

      cy.findByRole('button', { name: 'Recompile' }).click()
      cy.waitForCompile()
      cy.findByRole('button', { name: 'View logs' }).click()

      cy.findByText(
        "Package rerunfilecheck Warning: File `output.brf' has changed. Rerun to get bibliographical references right."
      )

      cy.findByText(
        /You have referenced something which has not yet been labelled/
      ).should('not.exist')
    })
  })
})
