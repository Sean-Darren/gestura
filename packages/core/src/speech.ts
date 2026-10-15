import { z } from 'zod'

export const TranscriptSchema = z
  .object({
    text: z.string().min(1).max(16000),
    lang: z.string().min(1).max(32),
    tSpeechStart: z.number().finite().nonnegative(),
    tSpeechEnd: z.number().finite().nonnegative(),
    tDone: z.number().finite().nonnegative()
  })
  .strict()
  .refine(
    (v) => v.tSpeechStart <= v.tSpeechEnd && v.tSpeechEnd <= v.tDone,
    'Speech timestamps must be ordered'
  )
export type Transcript = z.infer<typeof TranscriptSchema>
export const SpeechControlSchema = z.object({ enabled: z.boolean() }).strict()
export const SpeechStateSchema = z
  .object({
    state: z.enum(['off', 'loading', 'starting', 'listening', 'error']),
    micLive: z.boolean(),
    message: z.string().max(500)
  })
  .strict()
export type SpeechStatus = z.infer<typeof SpeechStateSchema>
export const SpeechCaptureStatusSchema = z
  .object({
    generation: z.number().int().nonnegative(),
    live: z.boolean(),
    error: z.boolean()
  })
  .strict()
export const SpeechPortSchema = z.object({ generation: z.number().int().nonnegative() }).strict()
export const AudioPacketSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    tCapture: z.number().finite().nonnegative(),
    samples: z
      .instanceof(Float32Array)
      .refine((v) => v.length === 512 && v.every((x) => Number.isFinite(x) && Math.abs(x) <= 1))
  })
  .strict()
export const AudioAckSchema = z.object({ seq: z.number().int().nonnegative() }).strict()
export const SpeechWorkerEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready') }).strict(),
  z.object({ kind: z.literal('error') }).strict(),
  z.object({ kind: z.literal('activity'), speaking: z.boolean() }).strict(),
  z.object({ kind: z.literal('transcript'), transcript: TranscriptSchema }).strict()
])
