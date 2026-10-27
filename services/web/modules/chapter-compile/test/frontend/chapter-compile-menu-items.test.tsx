import { FC, PropsWithChildren, useCallback, useState } from 'react'
import { expect } from 'chai'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import fetchMock from 'fetch-mock'
import { renderWithEditorContext } from '../../../../test/frontend/helpers/render-with-context'
import {
  PROJECT_ID,
  USER_ID,
} from '../../../../test/frontend/helpers/editor-providers'
import PdfCompileButton from '@/features/pdf-preview/components/pdf-compile-button'
import { DetachCompileContext } from '@/shared/context/detach-compile-context'
import ChapterCompileBanner from '../../frontend/js/components/chapter-compile-banner'

const KEY = `chapter_compile:${USER_ID}:${PROJECT_ID}`

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

  it('forgets a chapter that is gone when the project opens, before the menu is used', async function () {
    window.localStorage.setItem(KEY, JSON.stringify('chapters/old'))
    fetchMock.get('express:/project/:projectId/chapters', {
      chapters: ['chapters/intro'],
    })
    renderWithEditorContext(<ChapterCompileBanner />, {
      projectId: PROJECT_ID,
    })

    await waitFor(() => expect(window.localStorage.getItem(KEY)).to.equal(null))
  })

  it('compiles the chosen chapter again when the switch came too soon after the last compile', async function () {
    window.localStorage.setItem(KEY, JSON.stringify('chapters/methods'))
    fetchMock.get('express:/project/:projectId/chapters', {
      chapters: ['chapters/intro', 'chapters/methods'],
    })
    // the server refuses the first compile as too soon, as upstream does
    // within a second of the last one, and accepts the next
    const calls: any[] = []
    const ThrottledCompileProvider: FC<PropsWithChildren> = ({ children }) => {
      const [compiling, setCompiling] = useState(false)
      const [error, setError] = useState<string>()
      const startCompile = useCallback(async (options: any) => {
        calls.push(options)
        setCompiling(true)
        await Promise.resolve()
        setError(calls.length === 1 ? 'too-recently-compiled' : undefined)
        setCompiling(false)
      }, [])
      const value = { compiling, error, startCompile, lastCompileOptions: {} }
      return (
        <DetachCompileContext.Provider value={value as any}>
          <button onClick={() => startCompile({ includeOnly: 'chapters/methods' })}>
            switch
          </button>
          {children}
        </DetachCompileContext.Provider>
      )
    }
    renderWithEditorContext(<ChapterCompileBanner />, {
      projectId: PROJECT_ID,
      providers: { DetachCompileProvider: ThrottledCompileProvider },
    })
    fireEvent.click(screen.getByRole('button', { name: 'switch' }))

    await waitFor(() => expect(calls).to.have.length(2), { timeout: 3000 })
    expect(calls[1]).to.deep.equal({ includeOnly: 'chapters/methods' })
    await new Promise(resolve => setTimeout(resolve, 1500))
    expect(calls).to.have.length(2) // once only
  })
})
