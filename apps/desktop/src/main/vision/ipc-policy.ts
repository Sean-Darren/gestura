import type { IpcChannel } from '@gestura/core'
export type RendererRole = 'vision' | 'control' | 'overlay' | 'speech'
export function acceptsRendererChannel(role: RendererRole, channel: IpcChannel): boolean {
  if (channel === 'app:ready') return true
  if (role === 'speech') return channel === 'speech:capture'
  if (channel === 'system:toggle-pause') return role === 'control' || role === 'overlay'
  if (channel === 'palette:control') return role === 'control' || role === 'overlay'
  if (role === 'vision')
    return (
      channel === 'vision:frame' || channel === 'vision:status' || channel === 'vision:diagnostics'
    )
  if (role === 'control')
    return (
      channel === 'snap:control' ||
      channel === 'speech:control' ||
      channel === 'bench:control' ||
      channel === 'vision:control' ||
      channel === 'replay:control' ||
      channel === 'pointer:control' ||
      channel === 'calibration:control' ||
      channel === 'gestures:control'
    )
  return false
}
