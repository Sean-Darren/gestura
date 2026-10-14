import { z } from 'zod'
import { PoseSchema } from './pointer'
import { PointerConfigSchema } from './config'
const finite = z.number().finite()
export const GazeMappingSchema = z
  .object({
    features: z.literal('iris-offsets-head-v1'),
    mean: z.array(finite).length(6),
    scale: z.array(finite.positive()).length(6),
    x: z.array(finite).length(7),
    y: z.array(finite).length(7),
    rmse: finite.nonnegative().max(1),
    samples: z.number().int().min(9).max(10000)
  })
  .strict()
export type GazeMapping = z.infer<typeof GazeMappingSchema>
export const CalibrationProfileSchema = z
  .object({
    version: z.literal(1),
    loggingEnabled: z.boolean().default(false),
    createdAt: finite.nonnegative(),
    durationMs: finite.nonnegative(),
    neutral: PoseSchema,
    range: z
      .object({
        left: finite.min(1).max(85),
        right: finite.min(1).max(85),
        up: finite.min(1).max(85),
        down: finite.min(1).max(85)
      })
      .strict(),
    pointer: PointerConfigSchema,
    gaze: z.object({ enabled: z.boolean(), mapping: GazeMappingSchema.nullable() }).strict(),
    blink: z
      .object({
        closedScore: finite.min(0.2).max(0.95),
        openScore: finite.min(0).max(0.9),
        minLongBlinkMs: finite.min(200).max(3000),
        naturalMaxMs: finite.nonnegative().max(3000),
        deliberateMs: z.array(finite.min(400).max(3000)).length(3),
        naturalObservationMs: z.literal(10000)
      })
      .strict(),
    display: z
      .object({
        width: finite.positive(),
        height: finite.positive(),
        scaleFactor: finite.positive()
      })
      .strict(),
    quickTestHits: z.literal(5)
  })
  .strict()
  .superRefine((profile, ctx) => {
    if (profile.gaze.enabled && !profile.gaze.mapping)
      ctx.addIssue({ code: 'custom', message: 'Enabled gaze requires a fitted mapping' })
    if (profile.pointer.gazeEnabled !== profile.gaze.enabled)
      ctx.addIssue({ code: 'custom', message: 'Gaze settings must agree' })
    if (profile.blink.openScore >= profile.blink.closedScore)
      ctx.addIssue({ code: 'custom', message: 'Blink hysteresis must have an open/closed gap' })
    if (profile.blink.minLongBlinkMs <= profile.blink.naturalMaxMs)
      ctx.addIssue({ code: 'custom', message: 'Long blink must exceed observed natural blinks' })
    if (profile.pointer.deadZoneDeg >= Math.min(...Object.values(profile.range)))
      ctx.addIssue({ code: 'custom', message: 'Dead zone must fit the motion range' })
  })
export type CalibrationProfile = z.infer<typeof CalibrationProfileSchema>
export const CALIBRATION_STAGES = [
  'framing',
  'neutral',
  'range',
  'gaze',
  'deliberate-blinks',
  'natural-blinks',
  'quick-test',
  'review',
  'complete',
  'cancelled'
] as const
export type CalibrationStage = (typeof CALIBRATION_STAGES)[number]
export const CalibrationStateSchema = z
  .object({
    firstRun: z.boolean(),
    active: z.boolean(),
    stage: z.enum(CALIBRATION_STAGES),
    paused: z.boolean(),
    elapsedMs: finite.nonnegative(),
    remainingMs: finite.nonnegative(),
    index: z.number().int().min(0).max(9),
    message: z.string().max(500),
    faceCentered: z.boolean(),
    faceDetected: z.boolean(),
    lighting: z.enum(['unknown', 'dark', 'bright', 'good']),
    gazeEnabled: z.boolean(),
    loggingEnabled: z.boolean(),
    cursor: z
      .object({ x: finite.min(0).max(1), y: finite.min(0).max(1) })
      .strict()
      .nullable(),
    target: z
      .object({ x: finite.min(0).max(1), y: finite.min(0).max(1) })
      .strict()
      .nullable(),
    dwellProgress: finite.min(0).max(1)
  })
  .strict()
export type CalibrationState = z.infer<typeof CalibrationStateSchema>
export const CalibrationControlSchema = z.discriminatedUnion('operation', [
  z
    .object({ operation: z.enum(['start', 'next', 'retry', 'cancel', 'save', 'clear-log']) })
    .strict(),
  z.object({ operation: z.literal('gaze'), enabled: z.boolean() }).strict(),
  z.object({ operation: z.literal('logging'), enabled: z.boolean() }).strict()
])
export const VisionDiagnosticsSchema = z
  .object({ tCapture: finite.nonnegative(), luminance: finite.min(0).max(1) })
  .strict()
