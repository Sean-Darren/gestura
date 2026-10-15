import { describe, expect, it } from 'vitest'
import {
  FaceFrameSchema,
  SerializedFaceFrameSchema,
  serializeFaceFrame,
  LANDMARK_VALUES
} from './face-frame'
import { createIpcEnvelope, parseIpcEnvelope } from './index'
const frame = (): {
  tCapture: number
  tInferDone: number
  faceDetected: boolean
  landmarks: Float32Array
  blendshapes: Record<string, number>
  matrix: Float32Array
} => ({
  tCapture: 100,
  tInferDone: 105,
  faceDetected: false,
  landmarks: new Float32Array(LANDMARK_VALUES),
  blendshapes: {},
  matrix: new Float32Array(16)
})
describe('derived face frames', () => {
  it('round-trips JSON/bridge arrays into typed arrays at IPC', () => {
    const serialized = serializeFaceFrame(frame())
    expect(
      SerializedFaceFrameSchema.parse(JSON.parse(JSON.stringify(serialized))).landmarks
    ).toBeInstanceOf(Float32Array)
    const envelope = parseIpcEnvelope(createIpcEnvelope('vision:frame', serialized))
    if (envelope.channel !== 'vision:frame') throw new Error('Wrong channel')
    expect(envelope.payload.landmarks.length).toBe(1434)
    expect(envelope.payload.matrix.length).toBe(16)
  })
  it('rejects pixels, wrong lengths, nonfinite values, invalid scores and timestamps', () => {
    expect(() => FaceFrameSchema.parse({ ...frame(), pixels: [1, 2, 3] })).toThrow()
    expect(() => FaceFrameSchema.parse({ ...frame(), matrix: new Float32Array(15) })).toThrow()
    const invalid = frame()
    invalid.landmarks[0] = Number.NaN
    expect(() => FaceFrameSchema.parse(invalid)).toThrow()
    expect(() =>
      FaceFrameSchema.parse({ ...frame(), faceDetected: true, blendshapes: { jawOpen: 2 } })
    ).toThrow()
    expect(() => FaceFrameSchema.parse({ ...frame(), tInferDone: 99 })).toThrow()
    expect(() => FaceFrameSchema.parse({ ...frame(), blendshapes: { jawOpen: 0.5 } })).toThrow()
  })
})
