import { useCallback } from 'react'
import localStorage from '@/infrastructure/local-storage'
import usePersistedState from '@/shared/hooks/use-persisted-state'
import { useProjectContext } from '@/shared/context/project-context'

// The chapter a user compiles alone, per project, in the browser rather than
// in the project. local-compile-context.tsx reads the same key.
const chapterKey = (projectId: string) => `chapter_compile:${projectId}`

export function useChapterChoice(): [string, (chapter: string) => void] {
  const { projectId } = useProjectContext()
  const key = chapterKey(projectId)
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
