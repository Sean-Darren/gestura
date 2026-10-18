import { SnapBoundsSchema } from './snap'
import { z } from 'zod'
const finite = z.number().finite()
const point = { x: finite, y: finite, t: finite.nonnegative() }
export const GestureEventSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('click'),
      button: z.enum(['left', 'right']),
      source: z.enum(['long-blink', 'right-wink', 'dwell']),
      ...point
    })
    .strict(),
  z
    .object({ kind: z.enum(['mouseDown', 'mouseUp']), button: z.literal('left'), ...point })
    .strict(),
  z
    .object({ kind: z.literal('wink'), eye: z.enum(['left', 'right']), t: finite.nonnegative() })
    .strict(),
  z.object({ kind: z.literal('toggleListening'), t: finite.nonnegative() }).strict()
])
export type GestureEvent = z.infer<typeof GestureEventSchema>
export const EarBaselineSchema = z
  .object({
    left: finite.positive().max(2),
    right: finite.positive().max(2),
    aspectRatio: finite.min(0.5).max(4),
    closedRatio: finite.min(0.1).max(0.7),
    openRatio: finite.min(0.4).max(1)
  })
  .strict()
  .refine((v) => v.openRatio > v.closedRatio, 'EAR hysteresis needs an open/closed gap')
export type EarBaseline = z.infer<typeof EarBaselineSchema>
export const GestureControlSchema = z.object({ mode: z.enum(['off', 'blink', 'dwell']) }).strict()
export const GestureDetectionSchema = z
  .object({
    left: z.enum(['unknown', 'open', 'closed']),
    right: z.enum(['unknown', 'open', 'closed']),
    phase: z.enum(['waiting', 'ready', 'tracking', 'accepted', 'rejected']),
    reason: z.enum([
      'ready',
      'mode-off',
      'eyes-not-open',
      'face-lost',
      'invalid-eye-signal',
      'moving',
      'speech',
      'too-short',
      'too-long',
      'unsynchronised',
      'reclosed',
      'cooldown',
      'left-wink-unmapped',
      'dragging',
      'accepted'
    ]),
    durationMs: finite.nonnegative(),
    minLongBlinkMs: finite.nonnegative(),
    maxLongBlinkMs: finite.nonnegative(),
    winkMinMs: finite.nonnegative(),
    closedScore: finite.min(0).max(1),
    openScore: finite.min(0).max(1)
  })
  .strict()
export type GestureDetection = z.infer<typeof GestureDetectionSchema>
export const GestureDiagnosticsSchema = z
  .object({
    detection: GestureDetectionSchema,
    detectedClicks: z.number().int().nonnegative(),
    sentClicks: z.number().int().nonnegative(),
    delivery: z.enum(['none', 'sent', 'blocked', 'overlay', 'failed']),
    deliveryMessage: z.string().max(500)
  })
  .strict()
export type GestureDiagnostics = z.infer<typeof GestureDiagnosticsSchema>
export const OverlayStateSchema = z
  .object({
    gestureDiagnostics: GestureDiagnosticsSchema.optional(),
    snap: SnapBoundsSchema.nullable().default(null),
    mode: z.enum(['off', 'blink', 'dwell']),
    paused: z.boolean(),
    frozen: z.boolean(),
    dwellProgress: finite.min(0).max(1),
    pauseProgress: finite.min(0).max(1),
    cursor: z.object({ x: finite, y: finite }).strict().nullable(),
    click: z
      .object({ x: finite, y: finite, button: z.enum(['left', 'right']), t: finite.nonnegative() })
      .strict()
      .nullable(),
    message: z.string().max(500),
    width: finite.positive(),
    height: finite.positive(),
    pauseTargetSize: finite.min(48).max(160)
  })
  .strict()
export type OverlayState = z.infer<typeof OverlayStateSchema>
