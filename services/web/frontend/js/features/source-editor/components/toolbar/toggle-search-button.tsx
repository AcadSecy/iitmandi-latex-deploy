import { FC } from 'react'
import * as commands from '@/features/source-editor/extensions/toolbar/commands'
import { searchPanelOpen } from '@codemirror/search'
import { ToolbarButton } from '@/features/source-editor/components/toolbar/toolbar-button'
import { EditorState } from '@codemirror/state'
import { useTranslation } from 'react-i18next'
import { isMac } from '@/shared/utils/os'

export const ToggleSearchButton: FC<{
  state: EditorState
  showLabel?: boolean
}> = ({ state, showLabel = false }) => {
  const { t } = useTranslation()

  return (
    <ToolbarButton
      id="toolbar-toggle-search"
      label={t('toolbar_search_file')}
      command={commands.toggleSearch}
      active={searchPanelOpen(state)}
      icon={showLabel ? t('toolbar_search_file') : 'search'}
      textIcon={showLabel}
      className={showLabel ? 'ol-cm-toolbar-button-wide' : undefined}
      shortcut={isMac ? '⌘F' : 'Ctrl+F'}
    />
  )
}
