import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import { FaceFrameSchema, LANDMARK_VALUES } from '@gestura/core'
import type { FaceFrame } from '@gestura/core'

export function toFaceFrame(
  result: FaceLandmarkerResult,
  tCapture: number,
  tInferDone: number
): FaceFrame {
  const face = result.faceLandmarks[0]
  const detected = face !== undefined && face.length === 478
  const landmarks = new Float32Array(LANDMARK_VALUES)
  const matrix = new Float32Array(16)
  const blendshapes: Record<string, number> = {}
  if (detected) {
    face.forEach((point, index) => {
      landmarks[index * 3] = point.x
      landmarks[index * 3 + 1] = point.y
      landmarks[index * 3 + 2] = point.z
    })
    for (const score of result.faceBlendshapes[0]?.categories ?? [])
      blendshapes[score.categoryName] = score.score
    const transform = result.facialTransformationMatrixes[0]
    if (!transform || transform.data.length !== 16)
      throw new Error('Missing face transformation matrix')
    matrix.set(transform.data)
  } else if (face) throw new Error('Unexpected landmark count')
  return FaceFrameSchema.parse({
    tCapture,
    tInferDone,
    faceDetected: detected,
    landmarks,
    blendshapes,
    matrix
  })
}
