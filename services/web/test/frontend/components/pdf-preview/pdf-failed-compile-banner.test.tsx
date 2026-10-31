import { render, screen } from '@testing-library/react'
import { expect } from 'chai'
import sinon from 'sinon'
import PdfFailedCompileBanner from '../../../../frontend/js/features/pdf-preview/components/pdf-failed-compile-banner'
import { DetachCompileContext } from '../../../../frontend/js/shared/context/detach-compile-context'

function renderBanner(context: Record<string, unknown>) {
  const setShowLogs = sinon.stub()
  render(
    <DetachCompileContext.Provider value={{ setShowLogs, ...context } as any}>
      <PdfFailedCompileBanner />
    </DetachCompileContext.Provider>
  )
  return { setShowLogs }
}

describe('<PdfFailedCompileBanner />', function () {
  it('marks the PDF of the last good compile as out of date after a failed compile', function () {
    renderBanner({ error: 'failure', pdfFile: { pdfUrl: '/old.pdf' } })

    screen.getByText(/latest compile failed.*last successful compile/)
  })

  it('is hidden when the first compile failed and there is no earlier PDF', function () {
    renderBanner({ error: 'failure', pdfFile: undefined })

    expect(screen.queryByRole('status')).to.not.exist
  })

  it('opens the logs from the banner', function () {
    const { setShowLogs } = renderBanner({
      error: 'failure',
      pdfFile: { pdfUrl: '/old.pdf' },
    })

    screen.getByRole('button', { name: 'View logs' }).click()

    expect(setShowLogs.calledWith(true)).to.be.true
  })

  it('is hidden after a good compile', function () {
    renderBanner({ error: undefined, pdfFile: { pdfUrl: '/new.pdf' } })

    expect(screen.queryByRole('status')).to.not.exist
  })

  it('is hidden for a partial PDF from a timeout or Stop', function () {
    renderBanner({
      error: 'failure',
      pdfFile: { pdfUrl: '/partial.pdf', partial: 'timedout' },
    })

    expect(screen.queryByRole('status')).to.not.exist
  })

  it('is hidden for errors that are not a failed compile', function () {
    renderBanner({ error: 'rate-limited', pdfFile: { pdfUrl: '/old.pdf' } })

    expect(screen.queryByRole('status')).to.not.exist
  })
})
