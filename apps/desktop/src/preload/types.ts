import type { IpcChannel, IpcPayloadFor, IpcSendPayloadFor } from '@gestura/core'

export interface GesturaApi {
  on<Channel extends IpcChannel>(
    channel: Channel,
    callback: (payload: IpcPayloadFor<Channel>) => void
  ): () => void
  send<Channel extends IpcChannel>(channel: Channel, payload: IpcSendPayloadFor<Channel>): void
}
