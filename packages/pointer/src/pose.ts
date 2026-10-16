import type { Pose, PointerDisplay, PointerProfile } from '@gestura/core'
import { DEFAULT_POINTER_CONFIG } from '@gestura/core/config'
import type { PointerConfig } from '@gestura/core/config'
export interface Point {
  x: number
  y: number
}

/**
 * MediaPipe matrices are column-major. The unmirrored camera flips subject left/right,
 * so yaw is negated here to restore subject-relative direction: positive yaw moves right;
 * positive pitch moves down (pitch is already subject-relative, so it is not negated).
 */
export function headPose(matrix: Float32Array): Pose {
  if (matrix.length !== 16 || !matrix.every(Number.isFinite)) throw new Error('Invalid face matrix')
  const x = Math.hypot(matrix[0]!, matrix[1]!, matrix[2]!)
  const y = Math.hypot(matrix[4]!, matrix[5]!, matrix[6]!)
  const z = Math.hypot(matrix[8]!, matrix[9]!, matrix[10]!)
  if (Math.min(x, y, z) < 1e-6) throw new Error('Degenerate face matrix')
  const r02 = matrix[8]! / z
  const r12 = matrix[9]! / z
  const r22 = matrix[10]! / z
  const degrees = 180 / Math.PI
  return {
    yaw: -Math.atan2(r02, r22) * degrees,
    pitch: Math.atan2(-r12, Math.hypot(r02, r22)) * degrees
  }
}
export function physicalBounds(display: PointerDisplay): PointerDisplay['bounds'] {
  const scale = display.coordinateSpace === 'points' ? display.scaleFactor : 1
  const { x, y, width, height } = display.bounds
  return { x: x * scale, y: y * scale, width: width * scale, height: height * scale }
}
export function clampPoint(point: Point, display: PointerDisplay): Point {
  const b = physicalBounds(display)
  return {
    x: Math.max(b.x, Math.min(b.x + b.width - 1, point.x)),
    y: Math.max(b.y, Math.min(b.y + b.height - 1, point.y))
  }
}
function curve(angle: number, range: number, config: PointerConfig): number {
  const magnitude = Math.min(
    1,
    Math.max(0, Math.abs(angle) - config.deadZoneDeg) / (range - config.deadZoneDeg)
  )
  return (
    Math.sign(angle) * (config.centerGain * magnitude + (1 - config.centerGain) * magnitude ** 3)
  )
}
export function mapToScreen(
  pose: Pose,
  profile: PointerProfile,
  display: PointerDisplay,
  config: PointerConfig = DEFAULT_POINTER_CONFIG
): Point {
  const b = physicalBounds(display)
  return clampPoint(
    {
      x:
        b.x +
        ((b.width - 1) *
          (1 +
            curve(
              pose.yaw - profile.neutral.yaw,
              (pose.yaw < profile.neutral.yaw ? profile.range?.left : profile.range?.right) ??
                config.yawRangeDeg,
              config
            ))) /
          2,
      y:
        b.y +
        ((b.height - 1) *
          (1 +
            curve(
              pose.pitch - profile.neutral.pitch,
              (pose.pitch < profile.neutral.pitch ? profile.range?.up : profile.range?.down) ??
                config.pitchRangeDeg,
              config
            ))) /
          2
    },
    display
  )
}
