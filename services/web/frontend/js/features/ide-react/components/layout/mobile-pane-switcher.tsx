import { useTranslation } from 'react-i18next'
import { MobilePane } from '../../hooks/use-mobile-editor-layout'

export default function MobilePaneSwitcher({
  pane,
  onSelect,
}: {
  pane: MobilePane
  onSelect: (pane: MobilePane) => void
}) {
  const { t } = useTranslation()

  return (
    <div
      className="mobile-pane-switcher"
      role="group"
      aria-label={t('layout_options')}
    >
      {(['files', 'code', 'pdf'] as const).map(value => (
        <button
          key={value}
          type="button"
          aria-pressed={pane === value}
          onClick={() => onSelect(value)}
        >
          {value === 'files' ? t('files', 'Files') : t(value)}
        </button>
      ))}
    </div>
  )
}
