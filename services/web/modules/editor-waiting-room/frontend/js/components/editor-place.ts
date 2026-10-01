// Response of POST /editor-places/check
export type EditorPlace = {
  enabled: boolean
  admitted: boolean
  position: number
  heartbeatSeconds: number
  idleMinutes: number
}
