import { useEffect, useRef } from 'react'
import { useIdeContext } from '@/shared/context/ide-context'
import { useFileTreeData } from '@/shared/context/file-tree-data-context'
import { useReferencesContext } from '@/features/ide-react/context/references-context'
import { findInTree } from '@/features/file-tree/util/find-in-tree'

const EVENTS = [
  'reciveNewDoc',
  'reciveNewFile',
  'reciveEntityRename',
  'removeEntity',
  // An upload over an existing doc changes it in place; the upload dialog then
  // asks the server to broadcast the doc's metadata, which is the only event.
  'broadcastDocMeta',
] as const
type BibEvent = (typeof EVENTS)[number]

// One upload can send several events (remove, then add); index once after they settle.
export const REINDEX_DELAY_MS = 500

const isBib = (name?: string) => !!name && name.toLowerCase().endsWith('.bib')

// Uploading, replacing, renaming or removing a .bib triggers none of the editor's own re-index points.
export function bibChangeFromEvent(
  event: BibEvent,
  args: unknown[],
  lookup: (entityId: string) => { name: string; type: string } | undefined
) {
  if (event === 'reciveEntityRename') {
    const [entityId, newName] = args as [string, string]
    const name = lookup(entityId)?.name
    // The renaming tab updates its tree before the echo, so the old name is gone there.
    return isBib(newName) || isBib(name) || name === newName
  }
  if (event === 'removeEntity') {
    const found = lookup(args[0] as string)
    // A removed folder may hold .bib files.
    return found?.type === 'folder' || isBib(found?.name)
  }
  if (event === 'broadcastDocMeta') {
    const { docId } = (args[0] ?? {}) as { docId?: string }
    return !!docId && isBib(lookup(docId)?.name)
  }
  const entity = args[1] as { name?: string } | undefined
  return isBib(entity?.name)
}

export function useReindexOnBibChange() {
  const { socket } = useIdeContext()
  const { fileTreeData } = useFileTreeData()
  const { indexAllReferences } = useReferencesContext()
  // Handlers read the tree as it was before the event, so renamed or removed
  // entities still have their old names.
  const treeRef = useRef(fileTreeData)
  treeRef.current = fileTreeData

  useEffect(() => {
    if (!socket) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const lookup = (entityId: string) => {
      const found = treeRef.current && findInTree(treeRef.current, entityId)
      return found ? { name: found.entity.name, type: found.type } : undefined
    }
    const handlers = EVENTS.map(event => {
      const handler = (...args: unknown[]) => {
        if (!bibChangeFromEvent(event, args, lookup)) return
        clearTimeout(timer)
        // Every tab gets the event, so no need to broadcast.
        timer = setTimeout(() => indexAllReferences(false), REINDEX_DELAY_MS)
      }
      socket.on(event, handler)
      return [event, handler] as const
    })
    return () => {
      clearTimeout(timer)
      for (const [event, handler] of handlers) {
        socket.removeListener(event, handler)
      }
    }
  }, [socket, indexAllReferences])
}
