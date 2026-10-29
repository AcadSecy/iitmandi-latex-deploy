import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import classNames from 'classnames'
import {
  OLDropdown,
  OLDropdownMenu,
  OLDropdownToggle,
} from '@/shared/components/ol/ol-dropdown-menu'
import ChangeLayoutOptions from './change-layout-options'
import MaterialIcon from '@/shared/components/material-icon'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import { useCommandProvider } from '../../hooks/use-command-provider'
import { useFeatureFlag } from '@/shared/context/split-test-context'
import { useEditorAnalytics } from '@/shared/hooks/use-editor-analytics'
import { useLayoutContext } from '@/shared/context/layout-context'

export default function ChangeLayoutButton({
  showLabel = false,
  inline = false,
}: {
  showLabel?: boolean
  inline?: boolean
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const toggleButtonClassName = classNames(
    'ide-redesign-toolbar-button-subdued',
    'ide-redesign-toolbar-dropdown-toggle-subdued',
    'ide-redesign-toolbar-button-icon'
  )

  const {
    detachIsLinked,
    detachRole,
    handleChangeLayout,
    handleDetach,
    focusMode,
    setFocusMode,
  } = useLayoutContext()

  const { sendEvent } = useEditorAnalytics()
  const focusModeEnabled = useFeatureFlag('focus-mode')

  const detachable = 'BroadcastChannel' in window

  const waitingForDetachedLink = !detachIsLinked && detachRole === 'detacher'

  useCommandProvider(
    () => [
      {
        id: 'change-layout-side-by-side',
        handler: () => handleChangeLayout('sideBySide'),
        label: t('split_view'),
      },
      {
        id: 'change-layout-editor-only',
        handler: () => handleChangeLayout('flat', 'editor'),
        label: t('editor_only'),
      },
      {
        id: 'change-layout-pdf-only',
        handler: () => handleChangeLayout('flat', 'pdf'),
        label: t('pdf_only'),
      },
      {
        id: 'change-layout-detached-pdf',
        handler: () => handleDetach(),
        disabled: !detachable || waitingForDetachedLink,
        label: t('pdf_in_different_tab'),
      },
      ...(focusModeEnabled
        ? [
            {
              id: 'change-layout-focus-mode',
              handler: () => {
                setFocusMode(!focusMode)
                sendEvent('focus-mode-toggle', { focusMode: !focusMode })
              },
              label: t('toggle_focus_mode'),
            },
          ]
        : []),
    ],
    [
      handleChangeLayout,
      t,
      detachable,
      handleDetach,
      waitingForDetachedLink,
      focusModeEnabled,
      focusMode,
      setFocusMode,
      sendEvent,
    ]
  )

  if (inline) {
    return (
      <div className="mobile-inline-layout">
        <button
          type="button"
          role="menuitem"
          className="dropdown-item mobile-toolbar-action-row"
          aria-label={t('layout_options')}
          aria-expanded={expanded}
          aria-controls="mobile-inline-layout-options"
          onClick={() => setExpanded(open => !open)}
        >
          <MaterialIcon
            type="space_dashboard"
            unfilled
            className="dropdown-item-leading-icon"
          />
          <span>{t('layout')}</span>
          <MaterialIcon
            type={expanded ? 'expand_more' : 'chevron_right'}
            className="dropdown-item-trailing-icon"
          />
        </button>
        {expanded && (
          <ul
            id="mobile-inline-layout-options"
            role="group"
            aria-label={t('layout_options')}
          >
            <ChangeLayoutOptions />
          </ul>
        )}
      </div>
    )
  }

  const toggle = (
    <OLDropdownToggle
      as={showLabel ? 'button' : undefined}
      role={showLabel ? 'menuitem' : undefined}
      aria-haspopup="menu"
      id="layout-dropdown-btn"
      className={
        showLabel
          ? 'dropdown-item mobile-toolbar-action-row'
          : toggleButtonClassName
      }
      aria-label={t('layout_options')}
    >
      <MaterialIcon
        type="space_dashboard"
        unfilled
        className={showLabel ? 'dropdown-item-leading-icon' : undefined}
      />
      {showLabel && (
        <>
          <span>{t('layout')}</span>
          <MaterialIcon
            type="chevron_right"
            className="dropdown-item-trailing-icon"
          />
        </>
      )}
    </OLDropdownToggle>
  )

  return (
    <div className="ide-redesign-toolbar-button-container">
      <OLDropdown className="toolbar-item layout-dropdown" align="end">
        {showLabel ? (
          toggle
        ) : (
          <OLTooltip
            id="tooltip-open-layout-options"
            description={t('layout_options')}
            overlayProps={{ delay: 0, placement: 'bottom' }}
          >
            <span>{toggle}</span>
          </OLTooltip>
        )}
        <OLDropdownMenu>
          <ChangeLayoutOptions />
        </OLDropdownMenu>
      </OLDropdown>
    </div>
  )
}
