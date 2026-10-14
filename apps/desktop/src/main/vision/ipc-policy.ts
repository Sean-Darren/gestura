import type { IpcChannel } from '@gestura/core'
export type RendererRole = 'vision' | 'control' | 'overlay'
export function acceptsRendererChannel(role: RendererRole, channel: IpcChannel): boolean {
  if (channel === 'app:ready') return true
  if (role === 'vision') return channel === 'vision:frame' || channel === 'vision:status'
  if (role === 'control') return channel === 'vision:control' || channel === 'replay:control'
  return false
}
