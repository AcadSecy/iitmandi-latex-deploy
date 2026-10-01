import { expect } from 'chai'
import sinon from 'sinon'
import {
  errorPrompt,
  getAskAiSettings,
  openAssistant,
  selectionPrompt,
} from '../../frontend/js/open-assistant'
import type { LogEntry } from '@/features/pdf-preview/util/types'

describe('Ask AI', function () {
  let openStub: sinon.SinonStub
  let opened: { opener: unknown; focus: sinon.SinonStub }
  let exposedSettings: unknown

  before(function () {
    exposedSettings = window.metaAttributesCache.get('ol-ExposedSettings')
  })

  after(function () {
    window.metaAttributesCache.set('ol-ExposedSettings', exposedSettings)
  })

  beforeEach(function () {
    opened = { opener: window, focus: sinon.stub() }
    openStub = sinon.stub(window, 'open').returns(opened as unknown as Window)
  })

  afterEach(function () {
    openStub.restore()
  })

  describe('getAskAiSettings', function () {
    it('is off when no URL is configured', function () {
      window.metaAttributesCache.set('ol-ExposedSettings', {
        ...window.metaAttributesCache.get('ol-ExposedSettings'),
        askAiUrl: undefined,
      })
      expect(getAskAiSettings()).to.equal(null)
    })

    it('returns the configured assistant', function () {
      window.metaAttributesCache.set('ol-ExposedSettings', {
        ...window.metaAttributesCache.get('ol-ExposedSettings'),
        askAiUrl: 'https://chatgpt.com/?q=',
        askAiName: 'ChatGPT',
      })
      expect(getAskAiSettings()).to.deep.equal({
        url: 'https://chatgpt.com/?q=',
        name: 'ChatGPT',
      })
    })
  })

  describe('openAssistant', function () {
    it('opens the assistant in a named side window with the prompt', function () {
      openAssistant('https://chatgpt.com/?q=', 'fix \\section{A & B}')
      expect(openStub.calledOnce).to.equal(true)
      const [url, name, features] = openStub.firstCall.args
      expect(url).to.equal(
        'https://chatgpt.com/?q=' + encodeURIComponent('fix \\section{A & B}')
      )
      expect(name).to.equal('ask-ai')
      expect(features).to.match(/^popup,width=\d+,height=\d+,left=-?\d+,top=-?\d+$/)
    })

    it('stops the assistant from navigating this page', function () {
      openAssistant('https://chatgpt.com/?q=', 'hello')
      expect(opened.opener).to.equal(null)
      expect(opened.focus.calledOnce).to.equal(true)
    })

    it('shortens very long prompts', function () {
      openAssistant('https://chatgpt.com/?q=', 'x'.repeat(10000))
      const [url] = openStub.firstCall.args
      expect(url).to.equal('https://chatgpt.com/?q=' + 'x'.repeat(6000))
    })
  })

  describe('prompts', function () {
    it('wraps the selection in a LaTeX code block', function () {
      expect(selectionPrompt('\\frac{a}{b}')).to.include(
        '```latex\n\\frac{a}{b}\n```'
      )
    })

    it('includes the error, its file and its line', function () {
      const entry = {
        raw: 'raw log',
        level: 'error',
        key: 'k',
        file: 'main.tex',
        line: 12,
        message: 'Undefined control sequence.',
        content: 'l.12 \\foo',
      } as LogEntry
      const prompt = errorPrompt(entry)
      expect(prompt).to.include('(in main.tex, line 12)')
      expect(prompt).to.include('Undefined control sequence.\nl.12 \\foo')
    })

    it('falls back to the raw log text', function () {
      const entry = { raw: 'raw log', level: 'warning', key: 'k' } as LogEntry
      expect(errorPrompt(entry)).to.include('raw log')
    })
  })
})
