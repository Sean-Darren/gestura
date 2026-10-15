import { BenchControlSchema, BenchStateSchema } from './pointing-bench'
import { GestureControlSchema, OverlayStateSchema } from './gestures'
import {
  CalibrationControlSchema,
  CalibrationStateSchema,
  VisionDiagnosticsSchema
} from './calibration'
import { PointerControlSchema, PointerMetricsSchema } from './pointer'
import { z } from 'zod'
import {
  FaceFrameSchema,
  SerializedFaceFrameSchema,
  VisionStatusSchema,
  VisionMetricsSchema,
  ReplayPromptSchema,
  ReplayControlSchema,
  VisionControlSchema
} from './face-frame'

export const IPC_CHANNELS = [
  'bench:control',
  'bench:state',
  'app:ready',
  'app:status',
  'system:pause-state',
  'vision:frame',
  'vision:status',
  'vision:metrics',
  'vision:control',
  'replay:control',
  'replay:prompt',
  'pointer:control',
  'pointer:metrics',
  'calibration:control',
  'calibration:state',
  'vision:diagnostics',
  'gestures:control',
  'gestures:state',
  'system:toggle-pause'
] as const

export const IPC_TRANSPORT_CHANNEL = 'gestura:ipc'

export const IPC_PAYLOAD_SCHEMAS = {
  'bench:control': BenchControlSchema,
  'bench:state': BenchStateSchema,
  'app:ready': z.object({}).strict(),
  'app:status': z.object({ status: z.literal('ready') }).strict(),
  'system:pause-state': z.object({ paused: z.boolean() }).strict(),
  'vision:frame': z.union([FaceFrameSchema, SerializedFaceFrameSchema]),
  'vision:status': VisionStatusSchema,
  'vision:metrics': VisionMetricsSchema,
  'vision:control': VisionControlSchema,
  'replay:control': ReplayControlSchema,
  'replay:prompt': ReplayPromptSchema,
  'pointer:control': PointerControlSchema,
  'pointer:metrics': PointerMetricsSchema,
  'calibration:control': CalibrationControlSchema,
  'calibration:state': CalibrationStateSchema,
  'vision:diagnostics': VisionDiagnosticsSchema,
  'gestures:control': GestureControlSchema,
  'gestures:state': OverlayStateSchema,
  'system:toggle-pause': z.object({}).strict()
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

export type IpcSendPayloadFor<Channel extends IpcChannel> = z.input<
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
  payload: IpcSendPayloadFor<Channel>
): IpcEnvelope {
  return parseIpcEnvelope({ channel, payload, t: Date.now() })
}

export * from './ui-elements'

export * from './face-frame'

export * from './pointer'

export * from './calibration'

export * from './gestures'

export * from './pointing-bench'
