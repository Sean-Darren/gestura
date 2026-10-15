import { contextBridge, ipcRenderer } from 'electron'
import { createIpcEnvelope, parseIpcChannel, parseIpcEnvelope } from '@gestura/core'
import type { IpcChannel, IpcPayloadFor, IpcSendPayloadFor } from '@gestura/core'
import type { GesturaApi } from './types'

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
