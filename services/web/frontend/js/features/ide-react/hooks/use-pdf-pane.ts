import { useCallback, useRef } from 'react'
import { ImperativePanelHandle } from 'react-resizable-panels'
import useCollapsiblePanel from '@/features/ide-react/hooks/use-collapsible-panel'
import { useLayoutContext } from '@/shared/context/layout-context'

export const usePdfPane = () => {
  const {
    view,
    pdfLayout,
    changeLayout,
    detachRole,
    reattach,
    mobilePane,
    setMobilePane,
  } = useLayoutContext()

  const pdfPanelRef = useRef<ImperativePanelHandle>(null)
  const pdfIsOpen =
    mobilePane !== null
      ? mobilePane === 'pdf'
      : pdfLayout === 'sideBySide' || view === 'pdf'

  // CSS presents phone panes; do not save phone collapse/expand sizes.
  useCollapsiblePanel(pdfIsOpen, pdfPanelRef, mobilePane === null)

  // triggered by a double-click on the resizer
  const togglePdfPane = useCallback(() => {
    if (mobilePane !== null) {
      setMobilePane(pdfIsOpen ? 'code' : 'pdf')
      return
    }
    if (pdfIsOpen) {
      changeLayout('flat', 'editor')
    } else {
      changeLayout('sideBySide')
    }
  }, [changeLayout, pdfIsOpen, mobilePane, setMobilePane])

  // triggered by a click on the toggle button
  const setPdfIsOpen = useCallback(
    (value: boolean) => {
      if (mobilePane !== null) {
        setMobilePane(value ? 'pdf' : 'code')
        return
      }
      if (value) {
        // opening the PDF view, so close a detached PDF
        if (detachRole === 'detacher') {
          reattach()
        }
        changeLayout('sideBySide')
      } else {
        changeLayout('flat', 'editor')
      }
    },
    [changeLayout, detachRole, reattach, mobilePane, setMobilePane]
  )

  // triggered when the PDF pane becomes open
  const handlePdfPaneExpand = useCallback(() => {
    if (mobilePane !== null) return
    if (pdfLayout === 'flat' && view === 'editor') {
      changeLayout('sideBySide', 'editor')
    }
  }, [changeLayout, pdfLayout, view, mobilePane])

  // triggered when the PDF pane becomes closed (either by dragging or toggling)
  const handlePdfPaneCollapse = useCallback(() => {
    if (mobilePane !== null) return
    if (pdfLayout === 'sideBySide') {
      changeLayout('flat', 'editor')
    }
  }, [changeLayout, pdfLayout, mobilePane])

  return {
    togglePdfPane,
    handlePdfPaneExpand,
    handlePdfPaneCollapse,
    setPdfIsOpen,
    pdfIsOpen,
    pdfPanelRef,
  }
}
