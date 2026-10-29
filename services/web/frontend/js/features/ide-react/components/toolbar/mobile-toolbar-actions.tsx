import { PropsWithChildren, ReactNode, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import {
  OLDropdown,
  OLDropdownMenu,
  OLDropdownToggle,
} from '@/shared/components/ol/ol-dropdown-menu'
import MaterialIcon from '@/shared/components/material-icon'
import { NestableDropdownContext } from '@/shared/context/nestable-dropdown-context'

export default function MobileToolbarActions({
  mobile,
  children,
  commands,
  projectActions = false,
}: PropsWithChildren<{
  mobile: boolean
  commands?: ReactNode
  projectActions?: boolean
}>) {
  const { t } = useTranslation()
  const menuBar = useContext(NestableDropdownContext)
  if (!mobile) return <>{children}</>
  return (
    <OLDropdown
      align="end"
      autoClose="outside"
      className={
        projectActions
          ? 'mobile-toolbar-actions mobile-project-actions'
          : 'mobile-toolbar-actions'
      }
      onToggle={open => {
        if (open) menuBar?.setSelected(null)
      }}
    >
      <OLDropdownToggle
        id={
          projectActions ? 'mobile-project-actions' : 'mobile-toolbar-actions'
        }
        aria-label={t(projectActions ? 'project_actions' : 'more_options')}
        className="ide-redesign-toolbar-button-subdued mobile-toolbar-actions-toggle"
      >
        <MaterialIcon type={projectActions ? 'more_horiz' : 'expand_more'} />
      </OLDropdownToggle>
      <OLDropdownMenu className="mobile-toolbar-actions-menu" renderOnMount>
        {commands && (
          <li role="none">
            <ul role="group" className="mobile-toolbar-command-sections">
              {commands}
            </ul>
          </li>
        )}
        <li role="none" className="mobile-toolbar-actions-content">
          {children}
        </li>
      </OLDropdownMenu>
    </OLDropdown>
  )
}
