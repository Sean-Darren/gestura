import type { GesturaApi } from '../../preload/types'
export type DesktopConnectionState = 'connecting' | 'ready' | 'unavailable'

export function connectDesktop(
  api: GesturaApi | undefined,
  update: (state: DesktopConnectionState) => void
): () => void {
  update('connecting')
  let active = true
  let off: (() => void) | undefined
  const timeout = setTimeout(() => {
    if (active) update('unavailable')
  }, 5000)
  try {
    if (!api) throw new Error('Desktop bridge unavailable')
    off = api.on('app:status', () => {
      if (!active) return
      clearTimeout(timeout)
      update('ready')
    })
    api.send('app:ready', {})
  } catch {
    clearTimeout(timeout)
    update('unavailable')
  }
  return () => {
    active = false
    clearTimeout(timeout)
    off?.()
  }
}
