import { RefObject, useLayoutEffect } from 'react'
import { ImperativePanelHandle } from 'react-resizable-panels'

export default function useCollapsiblePanel(
  panelIsOpen: boolean,
  panelRef: RefObject<ImperativePanelHandle>,
  enabled = true
) {
  // useLayoutEffect keeps the panel-size update in the same paint cycle as the
  // CSS class changes that show/hide the panel content, eliminating a visible
  // flash between the two changes.
  useLayoutEffect(() => {
    if (!enabled) return
    const panelHandle = panelRef.current

    if (panelHandle) {
      if (panelIsOpen) {
        panelHandle.expand()
      } else {
        panelHandle.collapse()
      }
    }
  }, [panelIsOpen, panelRef, enabled])
}
