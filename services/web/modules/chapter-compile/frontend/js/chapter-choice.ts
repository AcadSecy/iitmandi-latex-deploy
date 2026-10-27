import { useCallback, useEffect, useRef } from 'react'
import localStorage from '@/infrastructure/local-storage'
import usePersistedState from '@/shared/hooks/use-persisted-state'
import { useProjectContext } from '@/shared/context/project-context'
import { useUserContext } from '@/shared/context/user-context'
import { useDetachCompileContext as useCompileContext } from '@/shared/context/detach-compile-context'
import { getJSON } from '@/infrastructure/fetch-json'
import { debugConsole } from '@/utils/debugging'

// The chapter a user compiles alone, per user and project, in the browser
// rather than in the project. local-compile-context.tsx builds the same key.
const chapterKey = (userId: string | null, projectId: string) =>
  `chapter_compile:${userId}:${projectId}`

export function useChapterChoice(): [string, (chapter: string) => void] {
  const { projectId } = useProjectContext()
  const { id: userId } = useUserContext()
  const key = chapterKey(userId, projectId)
  const [chapter] = usePersistedState<string>(key, '', { listen: true })

  const setChapter = useCallback(
    (value: string) => {
      if (value) {
        localStorage.setItem(key, value)
      } else {
        localStorage.removeItem(key)
      }
      // usePersistedState hears writes from other windows only; the compile
      // context in this window must hear this one too
      window.dispatchEvent(new StorageEvent('storage', { key }))
    },
    [key]
  )

  return [chapter, setChapter]
}

// Keeps the stored choice valid while the project is open.
export function useChapterChoiceCheck() {
  const { projectId, project } = useProjectContext()
  const rootDocId = project?.rootDocId
  const { compiling, error, startCompile } = useCompileContext()
  const [chapter, setChapter] = useChapterChoice()

  // On opening the project, and when the main document changes, forget a
  // chapter the main document no longer loads; the menu then shows "Whole
  // document". The server compiles everything for it either way.
  const chapterRef = useRef(chapter)
  chapterRef.current = chapter
  useEffect(() => {
    if (!chapterRef.current) return
    getJSON(`/project/${projectId}/chapters`)
      .then(data => {
        if (!data.chapters.includes(chapterRef.current)) setChapter('')
      })
      .catch(debugConsole.error)
  }, [projectId, rootDocId, setChapter])

  // Upstream refuses a compile that starts within a second of the last one
  // ("too-recently-compiled", no PDF), which a quick chapter switch can hit.
  // Try once more a little later, with the choice as it is then.
  const retried = useRef(false)
  useEffect(() => {
    if (compiling) return
    if (error !== 'too-recently-compiled') {
      retried.current = false
      return
    }
    if (retried.current) return
    retried.current = true
    const timer = window.setTimeout(
      () => startCompile({ includeOnly: chapterRef.current }),
      1100
    )
    return () => window.clearTimeout(timer)
  }, [compiling, error, startCompile])
}
