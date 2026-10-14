import { z } from 'zod'

export const IPC_CHANNELS = ['app:ready', 'app:status', 'system:pause-state'] as const

export const IPC_TRANSPORT_CHANNEL = 'gestura:ipc'

export const IPC_PAYLOAD_SCHEMAS = {
  'app:ready': z.object({}).strict(),
  'app:status': z.object({ status: z.literal('ready') }).strict(),
  'system:pause-state': z.object({ paused: z.boolean() }).strict()
} as const

export const IpcEnvelopeSchema = z
  .object({
    channel: z.enum(IPC_CHANNELS),
    payload: z.unknown(),
    t: z.number().int().nonnegative()
  })
  .strict()

export type IpcChannel = (typeof IPC_CHANNELS)[number]

export function parseIpcChannel(value: unknown): IpcChannel {
  return z.enum(IPC_CHANNELS).parse(value)
}

export type IpcPayloadFor<Channel extends IpcChannel> = z.infer<
  (typeof IPC_PAYLOAD_SCHEMAS)[Channel]
>

export type IpcEnvelope = {
  [Channel in IpcChannel]: {
    channel: Channel
    payload: IpcPayloadFor<Channel>
    t: number
  }
}[IpcChannel]

export function parseIpcEnvelope(value: unknown): IpcEnvelope {
  const envelope = IpcEnvelopeSchema.parse(value)
  const payload = IPC_PAYLOAD_SCHEMAS[envelope.channel].parse(envelope.payload)
  return { channel: envelope.channel, payload, t: envelope.t } as IpcEnvelope
}

export function createIpcEnvelope<Channel extends IpcChannel>(
  channel: Channel,
  payload: IpcPayloadFor<Channel>
): IpcEnvelope {
  return parseIpcEnvelope({ channel, payload, t: Date.now() })
}
