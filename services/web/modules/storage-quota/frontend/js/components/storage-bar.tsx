import { NEARLY_FULL } from '../storage-status'

// A thin bar showing how much of the available storage is used
function StorageBar({ share, label }: { share: number; label: string }) {
  const percent = Math.min(100, Math.round(share * 100))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      style={{
        height: '6px',
        borderRadius: '3px',
        background: 'var(--bg-light-tertiary)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${percent}%`,
          background:
            share >= NEARLY_FULL
              ? 'var(--bg-danger-01)'
              : 'var(--bg-accent-01)',
        }}
      />
    </div>
  )
}

export default StorageBar
