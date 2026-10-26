import { useCallback } from 'react'
import localStorage from '@/infrastructure/local-storage'
import usePersistedState from '@/shared/hooks/use-persisted-state'
import { useProjectContext } from '@/shared/context/project-context'
import { useUserContext } from '@/shared/context/user-context'

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

