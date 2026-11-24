import { expect } from 'chai'
import sinon from 'sinon'
import { fireEvent, render, screen } from '@testing-library/react'
import ReportProblemModal from '../../frontend/js/components/report-problem-modal'

describe('<ReportProblemModal/>', function () {
  beforeEach(function () {
    window.metaAttributesCache.set('ol-ExposedSettings', {
      ...window.metaAttributesCache.get('ol-ExposedSettings'),
      adminEmail: 'admin@example.com',
    })
  })

  // rendered without editor providers, as it is next to the navbar
  it('opens the report preview for this page in a new tab', function () {
    render(<ReportProblemModal show handleHide={() => {}} />)

    screen.getByRole('heading', { name: 'Report a problem' })
    const link = screen.getByRole('link', { name: 'Continue' })
    expect(link.getAttribute('href')).to.equal(
      `/report-problem?page=${encodeURIComponent(window.location.pathname)}`
    )
    expect(link.getAttribute('target')).to.equal('_blank')
    expect(link.getAttribute('rel')).to.contain('noopener')
  })

  it('shows the admin address for people without an email app', function () {
    render(<ReportProblemModal show handleHide={() => {}} />)

    const address = screen.getByText('admin@example.com')
    expect(address.tagName).to.equal('STRONG')
  })

  it('closes', function () {
    const handleHide = sinon.stub()
    render(<ReportProblemModal show handleHide={handleHide} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(handleHide).to.have.been.called
  })
})
