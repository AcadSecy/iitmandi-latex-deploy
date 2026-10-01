import { useEffect, useState } from 'react'
import { getJSON } from '@/infrastructure/fetch-json'
import getMeta from '@/utils/meta'

export type StorageStatus =
  | { enabled: false }
  | {
      enabled: true
      usedBytes: number
      /** Space that is always the user's; null for no limit */
      quotaBytes: number | null
      /** How far they may go past it while the server has room */
      maxBytes: number | null
      /** What they may use right now */
      limitBytes: number | null
      serverLowOnSpace: boolean
    }

export type ProjectSize = {
  id: string
  name: string
  bytes: number
  trashed: boolean
  archived: boolean
}

const MB = 1024 * 1024
const GB = 1024 * MB

export function formatSize(bytes: number) {
  if (bytes >= GB) {
    const gb = bytes / GB
    return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`
  }
  const mb = bytes / MB
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/** The share of what the user may use now, from 0 to 1, or null */
export function usedShare(status: StorageStatus | undefined) {
  if (!status?.enabled || status.limitBytes == null) return null
  return status.limitBytes > 0 ? status.usedBytes / status.limitBytes : 1
}

/** Nearly full from this share on: shown in red, with a notice */
export const NEARLY_FULL = 0.9

// The project list shows the status twice (sidebar and notice): ask once
let cachedRequest: Promise<StorageStatus> | null = null

function requestStatus(fresh: boolean): Promise<StorageStatus> {
  if (!getMeta('ol-ExposedSettings').storageQuotaEnabled) {
    return Promise.resolve({ enabled: false })
  }
  if (fresh) return getJSON<StorageStatus>('/user/storage?fresh=true')
  cachedRequest ??= getJSON<StorageStatus>('/user/storage').catch(err => {
    cachedRequest = null
    throw err
  })
  return cachedRequest
}

/**
 * The user's storage status. `fresh` works the usage out now (for the
 * settings page); otherwise a figure up to a few minutes old is used.
 */
export function useStorageStatus(fresh = false) {
  const [status, setStatus] = useState<StorageStatus>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    requestStatus(fresh)
      .then(setStatus)
      .catch(() => setFailed(true))
  }, [fresh])
  return { status, failed }
}
