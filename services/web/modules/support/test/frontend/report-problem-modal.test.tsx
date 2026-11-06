import { expect } from 'chai'
import sinon from 'sinon'
import fetchMock from 'fetch-mock'
import { fireEvent, render, screen } from '@testing-library/react'
import ReportProblemModal from '../../frontend/js/components/report-problem-modal'

describe('<ReportProblemModal/>', function () {
  beforeEach(function () {
    fetchMock.removeRoutes().clearHistory()
    window.metaAttributesCache.set('ol-ExposedSettings', {
      ...window.metaAttributesCache.get('ol-ExposedSettings'),
      adminEmail: 'admin@example.com',
    })
  })

  // rendered without editor providers, as it is next to the navbar
  it('opens the report for this page in a new tab', function () {
    fetchMock.get('/report-problem/address', { email: 'help@example.com' })
    render(<ReportProblemModal show handleHide={() => {}} />)

    screen.getByRole('heading', { name: 'Report a problem' })
    const link = screen.getByRole('link', { name: 'Write an email' })
    expect(link.getAttribute('href')).to.equal(
      `/report-problem?page=${encodeURIComponent(window.location.pathname)}`
    )
    expect(link.getAttribute('target')).to.equal('_blank')
    expect(link.getAttribute('rel')).to.contain('noopener')
  })

  it('shows the support address for people without an email app', async function () {
    fetchMock.get('/report-problem/address', { email: 'help@example.com' })
    render(<ReportProblemModal show handleHide={() => {}} />)

    const address = await screen.findByText('help@example.com')
    expect(address.tagName).to.equal('STRONG')
  })

  it('shows the admin address when the support address cannot be fetched', async function () {
    fetchMock.get('/report-problem/address', 500)
    render(<ReportProblemModal show handleHide={() => {}} />)

    await screen.findByText('admin@example.com')
  })

  it('asks for the address only once it is shown', function () {
    fetchMock.get('/report-problem/address', { email: 'help@example.com' })
    render(<ReportProblemModal show={false} handleHide={() => {}} />)

    expect(fetchMock.callHistory.called()).to.equal(false)
  })

  it('closes', function () {
    fetchMock.get('/report-problem/address', { email: 'help@example.com' })
    const handleHide = sinon.stub()
    render(<ReportProblemModal show handleHide={handleHide} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(handleHide).to.have.been.called
  })
})
