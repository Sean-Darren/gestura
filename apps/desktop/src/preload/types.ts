import type { IpcChannel, IpcPayloadFor } from '@gestura/core'

export interface GesturaApi {
  on<Channel extends IpcChannel>(
    channel: Channel,
    callback: (payload: IpcPayloadFor<Channel>) => void
  ): () => void
  send<Channel extends IpcChannel>(channel: Channel, payload: IpcPayloadFor<Channel>): void
}
