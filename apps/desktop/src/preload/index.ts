import '../shared/schema-runtime'
import { contextBridge, ipcRenderer } from 'electron'
import { createIpcEnvelope, parseIpcChannel, parseIpcEnvelope } from '@gestura/core'
import type { IpcChannel, IpcPayloadFor, IpcSendPayloadFor } from '@gestura/core'
import type { GesturaApi } from './types'
import { SpeechPortSchema } from '@gestura/core'

// Transfer only the dedicated capture port into the local capture page. No raw IPC API is exposed.
if (location.pathname.endsWith('/speech/index.html')) {
  ipcRenderer.on('gestura:speech-port', (event, descriptor: unknown) => {
    const parsed = SpeechPortSchema.safeParse(descriptor)
    if (!parsed.success || event.ports.length !== 1) return
    window.postMessage({ type: 'gestura:speech-port', descriptor: parsed.data }, '*', event.ports)
  })
}

const api: GesturaApi = {
  on(channel, callback) {
    parseIpcChannel(channel)
    const listener = (_event: Electron.IpcRendererEvent, candidate: unknown): void => {
      try {
        const envelope = parseIpcEnvelope(candidate)
        if (envelope.channel === channel)
          callback(envelope.payload as IpcPayloadFor<typeof channel>)
      } catch {
        // Ignore messages that do not match the shared IPC schemas.
      }
    }
    ipcRenderer.on('gestura:ipc', listener)
    return () => ipcRenderer.removeListener('gestura:ipc', listener)
  },
  send<Channel extends IpcChannel>(channel: Channel, payload: IpcSendPayloadFor<Channel>) {
    ipcRenderer.send('gestura:ipc', createIpcEnvelope(channel, payload))
  }
}

contextBridge.exposeInMainWorld('gestura', api)
