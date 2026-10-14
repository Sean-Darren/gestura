import { z } from 'zod'

const finite = z.number().finite()
export const PoseSchema = z.object({ yaw: finite, pitch: finite }).strict()
export type Pose = z.infer<typeof PoseSchema>
export const PointerProfileSchema = z
  .object({
    neutral: PoseSchema,
    range: z
      .object({
        left: finite.min(1).max(85),
        right: finite.min(1).max(85),
        up: finite.min(1).max(85),
        down: finite.min(1).max(85)
      })
      .strict()
      .optional()
  })
  .strict()
export type PointerProfile = z.infer<typeof PointerProfileSchema>
export const PointerDisplaySchema = z
  .object({
    bounds: z
      .object({ x: finite, y: finite, width: finite.positive(), height: finite.positive() })
      .strict(),
    scaleFactor: finite.positive(),
    coordinateSpace: z.enum(['points', 'pixels'])
  })
  .strict()
export type PointerDisplay = z.infer<typeof PointerDisplaySchema>
export const CursorCommandSchema = z
  .object({
    x: finite,
    y: finite,
    kind: z.enum(['head', 'gaze-jump']),
    tCapture: finite.nonnegative(),
    tInferDone: finite.nonnegative(),
    tPointerDone: finite.nonnegative()
  })
  .strict()
  .refine(
    (value) => value.tCapture <= value.tInferDone && value.tInferDone <= value.tPointerDone,
    'Pointer stage timestamps must be ordered'
  )
export type CursorCommand = z.infer<typeof CursorCommandSchema>
export const PointerControlSchema = z.object({ enabled: z.boolean() }).strict()
export const PointerMetricsSchema = z
  .object({
    enabled: z.boolean(),
    samples: z.number().int().nonnegative(),
    latencyP50Ms: finite.nonnegative(),
    latencyP95Ms: finite.nonnegative(),
    tCapture: finite.nonnegative(),
    tInferDone: finite.nonnegative(),
    tPointerDone: finite.nonnegative(),
    tMoveSent: finite.nonnegative(),
    message: z.string().max(500),
    replay: z.boolean()
  })
  .strict()
export type PointerMetrics = z.infer<typeof PointerMetricsSchema>
