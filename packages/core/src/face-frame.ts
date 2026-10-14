import { z } from 'zod'

export const LANDMARK_VALUES = 478 * 3
const floats = (length: number): z.ZodType<Float32Array> =>
  z.custom<Float32Array>(
    (value) =>
      value instanceof Float32Array && value.length === length && value.every(Number.isFinite),
    `Expected ${length} finite Float32 values`
  )
export const FaceFrameSchema = z
  .object({
    tCapture: z.number().finite().nonnegative(),
    tInferDone: z.number().finite().nonnegative(),
    faceDetected: z.boolean(),
    landmarks: floats(LANDMARK_VALUES),
    blendshapes: z
      .record(
        z.string().regex(/^(?:_[a-zA-Z]|[a-zA-Z])[a-zA-Z0-9_]{0,63}$/),
        z.number().finite().min(0).max(1)
      )
      .refine((value) => Object.keys(value).length <= 52),
    matrix: floats(16)
  })
  .strict()
  .superRefine((frame, context) => {
    if (frame.tInferDone < frame.tCapture)
      context.addIssue({ code: 'custom', message: 'Inference cannot precede capture' })
    if (
      !frame.faceDetected &&
      (frame.landmarks.some((v) => v !== 0) ||
        frame.matrix.some((v) => v !== 0) ||
        Object.keys(frame.blendshapes).length)
    )
      context.addIssue({
        code: 'custom',
        message: 'No-face frames must contain zero arrays and no scores'
      })
  })
export type FaceFrame = z.infer<typeof FaceFrameSchema>
// JSON and contextBridge use plain arrays; rehydrate only after strict validation.
export const SerializedFaceFrameSchema = z
  .object({
    tCapture: z.number().finite().nonnegative(),
    tInferDone: z.number().finite().nonnegative(),
    faceDetected: z.boolean(),
    landmarks: z.array(z.number().finite()).length(LANDMARK_VALUES),
    blendshapes: z.record(z.string(), z.number()),
    matrix: z.array(z.number().finite()).length(16)
  })
  .strict()
  .transform((value) =>
    FaceFrameSchema.parse({
      ...value,
      landmarks: new Float32Array(value.landmarks),
      matrix: new Float32Array(value.matrix)
    })
  )
export function serializeFaceFrame(frame: FaceFrame): {
  tCapture: number
  tInferDone: number
  faceDetected: boolean
  landmarks: number[]
  blendshapes: Record<string, number>
  matrix: number[]
} {
  const valid = FaceFrameSchema.parse(frame)
  return { ...valid, landmarks: Array.from(valid.landmarks), matrix: Array.from(valid.matrix) }
}
export const VisionStatusSchema = z
  .object({
    state: z.enum(['stopped', 'starting', 'running', 'paused', 'error', 'replaying']),
    message: z.string().max(500),
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
    cameraFps: z.number().finite().nonnegative()
  })
  .strict()
export type VisionStatus = z.infer<typeof VisionStatusSchema>
export const VisionMetricsSchema = z
  .object({
    fps: z.number().finite().nonnegative(),
    inferenceP50Ms: z.number().finite().nonnegative(),
    inferenceP95Ms: z.number().finite().nonnegative(),
    faceDetected: z.boolean(),
    eyeBlinkLeft: z.number().min(0).max(1),
    eyeBlinkRight: z.number().min(0).max(1),
    jawOpen: z.number().min(0).max(1)
  })
  .strict()
export type VisionMetrics = z.infer<typeof VisionMetricsSchema>
export const ReplayPromptSchema = z
  .object({
    prompt: z.string().max(500),
    index: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    remainingMs: z.number().finite().nonnegative(),
    state: z.enum(['idle', 'recording', 'paused', 'saved', 'error', 'replaying'])
  })
  .strict()
export const ReplayControlSchema = z
  .object({ operation: z.enum(['record', 'stop', 'play', 'cancel']) })
  .strict()
export const VisionControlSchema = z.object({ operation: z.enum(['start', 'stop']) }).strict()
