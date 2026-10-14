import type { FaceFrame, Pose, PointerDisplay } from '@gestura/core'
import type { PointerConfig } from '@gestura/core/config'
import { clampPoint, physicalBounds } from './pose'
import type { Point } from './pose'

/** Eye-local projections remove image roll; head angles compensate coarse apparent iris drift. */
export function estimateGaze(
  frame: FaceFrame,
  pose: Pose,
  display: PointerDisplay,
  config: PointerConfig
): Point | undefined {
  const offsets: Point[] = []
  for (const [iris, outer, inner, top, bottom] of [
    [468, 33, 133, 159, 145],
    [473, 362, 263, 386, 374]
  ]) {
    const at = (index: number, axis: number): number => frame.landmarks[index * 3 + axis]!
    const ax = at(outer!, 0),
      ay = at(outer!, 1)
    const bx = at(inner!, 0),
      by = at(inner!, 1)
    const vx = bx - ax,
      vy = by - ay,
      length2 = vx * vx + vy * vy
    const height = Math.hypot(at(bottom!, 0) - at(top!, 0), at(bottom!, 1) - at(top!, 1))
    if (length2 < 1e-8 || height < 1e-5) return undefined
    // Both eyes' horizontal axes run from image left to right.
    const sign = vx >= 0 ? 1 : -1
    const ox = at(iris!, 0) - (ax + bx) / 2,
      oy = at(iris!, 1) - (ay + by) / 2
    offsets.push({
      x: 0.5 + (sign * (ox * vx + oy * vy)) / length2,
      y: 0.5 + (sign * (-ox * vy + oy * vx)) / (Math.sqrt(length2) * height)
    })
  }
  const b = physicalBounds(display)
  const correction = config.gazeHeadCorrectionPerDeg
  return clampPoint(
    {
      x: b.x + (b.width - 1) * ((offsets[0]!.x + offsets[1]!.x) / 2 - pose.yaw * correction),
      y: b.y + (b.height - 1) * ((offsets[0]!.y + offsets[1]!.y) / 2 - pose.pitch * correction)
    },
    display
  )
}
export class GazeJump {
  private anchor: Point | undefined
  private since = 0
  private lastTime = -Infinity
  constructor(private readonly config: PointerConfig) {}
  reset(): void {
    this.anchor = undefined
    this.lastTime = -Infinity
  }
  update(point: Point | undefined, cursor: Point, time: number): Point | undefined {
    if (!this.config.gazeEnabled || !point || time <= this.lastTime) {
      this.reset()
      return undefined
    }
    this.lastTime = time
    if (
      !this.anchor ||
      Math.hypot(point.x - this.anchor.x, point.y - this.anchor.y) >
        this.config.gazeStabilityRadiusPx
    ) {
      this.anchor = point
      this.since = time
      return undefined
    }
    if (
      time - this.since >= this.config.gazeStableMs &&
      Math.hypot(point.x - cursor.x, point.y - cursor.y) > this.config.gazeJumpDistancePx
    ) {
      this.since = time
      return point
    }
    return undefined
  }
}
