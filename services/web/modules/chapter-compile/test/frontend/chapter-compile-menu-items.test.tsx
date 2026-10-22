import { expect } from 'chai'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import fetchMock from 'fetch-mock'
import { renderWithEditorContext } from '../../../../test/frontend/helpers/render-with-context'
import { PROJECT_ID } from '../../../../test/frontend/helpers/editor-providers'
import PdfCompileButton from '@/features/pdf-preview/components/pdf-compile-button'

const KEY = `chapter_compile:${PROJECT_ID}`

function openMenu() {
  fireEvent.click(
    screen.getByRole('button', { name: 'Toggle compile options menu' })
  )
}

describe('<ChapterCompileMenuItems/>', function () {
  beforeEach(function () {
    fetchMock.removeRoutes().clearHistory()
    fetchMock.post('express:/project/:projectId/compile', {
      status: 'success',
      outputFiles: [],
    })
    window.localStorage.clear()
  })

  it('lists the chapters and remembers the one chosen', async function () {
    fetchMock.get('express:/project/:projectId/chapters', {
      chapters: ['chapters/intro', 'chapters/methods'],
    })
    renderWithEditorContext(<PdfCompileButton />, { projectId: PROJECT_ID })
    openMenu()

    await screen.findByText('Compile one chapter')
    screen.getByRole('menuitem', { name: 'Whole document' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'chapters/methods' }))

    expect(JSON.parse(window.localStorage.getItem(KEY)!)).to.equal(
      'chapters/methods'
    )
    await waitFor(() =>
      expect(
        screen.getByRole('menuitem', { name: /chapters\/methods/ }).textContent
      ).to.contain('check')
    )
  })

  it('shows nothing for a project without \\include', async function () {
    fetchMock.get('express:/project/:projectId/chapters', { chapters: [] })
    renderWithEditorContext(<PdfCompileButton />, { projectId: PROJECT_ID })
    openMenu()

    await waitFor(() => expect(fetchMock.callHistory.called()).to.equal(true))
    expect(screen.queryByText('Compile one chapter')).to.equal(null)
  })

  it('forgets a chapter that is gone', async function () {
    window.localStorage.setItem(KEY, JSON.stringify('chapters/old'))
    fetchMock.get('express:/project/:projectId/chapters', {
      chapters: ['chapters/intro'],
    })
    renderWithEditorContext(<PdfCompileButton />, { projectId: PROJECT_ID })
    openMenu()

    await screen.findByText('Compile one chapter')
    await waitFor(() => expect(window.localStorage.getItem(KEY)).to.equal(null))
  })
})
