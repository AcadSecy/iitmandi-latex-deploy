import { useTranslation } from 'react-i18next'

export type MobileHistoryPane = 'files' | 'diff' | 'versions'

export default function MobileHistoryPaneSwitcher({
  pane,
  onSelect,
}: {
  pane: MobileHistoryPane
  onSelect: (pane: MobileHistoryPane) => void
}) {
  const { t } = useTranslation()
  const labels: Record<MobileHistoryPane, string> = {
    files: t('mobile_history_files', 'Files'),
    diff: t('mobile_history_diff', 'Diff'),
    versions: t('mobile_history_versions', 'Versions'),
  }

  return (
    <div
      className="mobile-history-pane-switcher"
      role="group"
      aria-label={t('history')}
    >
      {(['files', 'diff', 'versions'] as const).map(value => (
        <button
          key={value}
          type="button"
          aria-pressed={pane === value}
          onClick={() => onSelect(value)}
        >
          {labels[value]}
        </button>
      ))}
    </div>
  )
}
