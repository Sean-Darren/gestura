import type { FaceFrame } from '@gestura/core'

/**
 * Synthetic R_y(yaw) R_x(pitch) matching MediaPipe's physical convention (positive yaw =
 * subject turns right), stored column-major. The yaw sine is negated so `headPose` recovers
 * `yaw`/`pitch` from this matrix.
 */
export function rotation(yaw: number, pitch: number): Float32Array {
  const y = (yaw * Math.PI) / 180,
    p = (pitch * Math.PI) / 180
  const cy = Math.cos(y),
    sy = -Math.sin(y),
    cp = Math.cos(p),
    sp = Math.sin(p)
  return new Float32Array([
    cy,
    0,
    -sy,
    0,
    sy * sp,
    cp,
    cy * sp,
    0,
    sy * cp,
    -sp,
    cy * cp,
    0,
    0,
    0,
    0,
    1
  ])
}
export function testFrame(tCapture = 0, yaw = 0, pitch = 0): FaceFrame {
  return {
    tCapture,
    tInferDone: tCapture + 10,
    faceDetected: true,
    landmarks: new Float32Array(478 * 3),
    blendshapes: {},
    matrix: rotation(yaw, pitch)
  }
}
