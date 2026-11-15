import { expect } from 'chai'
import sinon from 'sinon'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import fetchMock from 'fetch-mock'
import { useAskAi } from '../../frontend/js/use-ask-ai'
import { resetMeta } from '../../../../test/frontend/helpers/reset-meta'

function Harness({ text = '\\section{Synthetic}' }: { text?: string }) {
  const { ask, modal } = useAskAi()
  return (
    <>
      <button onClick={() => ask(text, 'selection')}>Ask fixture</button>
      {modal}
    </>
  )
}

describe('per-request assistance review', function () {
  let open: sinon.SinonStub
  beforeEach(function () {
    resetMeta()
    window.metaAttributesCache.set('ol-project_id', '123456789012345678901234')
    window.metaAttributesCache.set('ol-ExposedSettings', {
      askAiUrl: 'https://example.test/?q=',
      askAiName: 'Example',
    })
    window.localStorage.setItem('ask-ai.notice-accepted', 'true')
    open = sinon.stub(window, 'open').returns(null)
  })
  afterEach(function () {
    cleanup()
    open.restore()
    fetchMock.removeRoutes().clearHistory()
    window.localStorage.removeItem('ask-ai.notice-accepted')
  })
  it('always previews context and destination despite remembered consent; Cancel sends nothing', async function () {
    render(<Harness />)
    fireEvent.click(screen.getByText('Ask fixture'))
    await screen.findByRole('dialog')
    expect(
      (
        screen.getByLabelText(
          'Selected text or error excerpt'
        ) as HTMLTextAreaElement
      ).value
    ).to.equal('\\section{Synthetic}')
    expect(screen.getByText('https://example.test/?q=')).to.exist
    expect(
      (
        screen.getByRole('button', {
          name: 'Open Example',
        }) as HTMLButtonElement
      ).disabled
    ).to.equal(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(open.called).to.equal(false)
  })
  it('resets confirmation when context changes and sends exactly the reviewed excerpt', async function () {
    render(<Harness />)
    fireEvent.click(screen.getByText('Ask fixture'))
    const checkbox = await screen.findByRole('checkbox')
    fireEvent.click(checkbox)
    fireEvent.change(screen.getByLabelText('Selected text or error excerpt'), {
      target: { value: '\\frac{1}{2}' },
    })
    expect((checkbox as HTMLInputElement).checked).to.equal(false)
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: 'Open Example' }))
    expect(open.calledOnce).to.equal(true)
    const prompt = decodeURIComponent(open.firstCall.args[0].split('?q=')[1])
    expect(prompt).to.include(
      JSON.stringify({ kind: 'selection', excerpt: '\\frac{1}{2}' })
    )
  })
  it('redacts recognized secrets before review', async function () {
    render(<Harness text="password=synthetic-password" />)
    fireEvent.click(screen.getByText('Ask fixture'))
    const field = (await screen.findByLabelText(
      'Selected text or error excerpt'
    )) as HTMLTextAreaElement
    expect(field.value).to.equal('[REDACTED CREDENTIAL]')
    expect(open.called).to.equal(false)
  })
  it('prevents oversize UTF-8 excerpts from being sent', async function () {
    render(<Harness text={'🧪'.repeat(600)} />)
    fireEvent.click(screen.getByText('Ask fixture'))
    fireEvent.click(await screen.findByRole('checkbox'))
    expect(
      (
        screen.getByRole('button', {
          name: 'Open Example',
        }) as HTMLButtonElement
      ).disabled
    ).to.equal(true)
    expect(open.called).to.equal(false)
  })
  it('requires consent before a managed POST and renders the explanation as text', async function () {
    window.metaAttributesCache.set('ol-ExposedSettings', { askAiManaged: true })
    const base = '/project/123456789012345678901234/ai-assistance'
    fetchMock.get(base + '/config', {
      enabled: true,
      destination: 'https://provider.example/v1/chat/completions',
      revision: 'fixture-policy',
      policySummary: 'Test policy',
    })
    fetchMock.post(base + '/suggest', {
      explanation: '<script>synthetic</script>',
      replacement: null,
    })
    render(<Harness />)
    fireEvent.click(screen.getByText('Ask fixture'))
    await screen.findByText('Test policy')
    expect(fetchMock.callHistory.calls(base + '/suggest').length).to.equal(0)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Send excerpt' }))
    await screen.findByText('<script>synthetic</script>')
    expect(document.querySelector('script')).to.equal(null)
    await waitFor(() =>
      expect(fetchMock.callHistory.calls(base + '/suggest').length).to.equal(1)
    )
    expect(open.called).to.equal(false)
  })
})
