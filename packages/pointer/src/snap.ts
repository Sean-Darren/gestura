import type { UiElement } from '@gestura/core'
import { DEFAULT_SNAP_CONFIG } from '@gestura/core/config'
import type { SnapConfig } from '@gestura/core/config'
import type { Point } from './pose'
export type SnapCandidate = Readonly<Omit<UiElement, 'bounds'>> & {
  readonly bounds: Readonly<UiElement['bounds']>
}
export function snapKey(t: SnapCandidate): string {
  const b = t.bounds
  return `${t.role}:${b.x}:${b.y}:${b.width}:${b.height}`
}
export function targetScore(
  cursor: Point,
  gaze: Readonly<Point> | undefined,
  t: SnapCandidate,
  config: SnapConfig = DEFAULT_SNAP_CONFIG
): number {
  const b = t.bounds
  if (
    !t.isClickable ||
    !t.isEnabled ||
    t.isOffscreen ||
    ![b.x, b.y, b.width, b.height, cursor.x, cursor.y].every(Number.isFinite) ||
    b.width <= 0 ||
    b.height <= 0 ||
    b.width > 300 ||
    b.height > 300
  )
    return Infinity
  const dx = Math.max(b.x - cursor.x, 0, cursor.x - b.x - b.width),
    dy = Math.max(b.y - cursor.y, 0, cursor.y - b.y - b.height),
    edge = Math.hypot(dx, dy)
  if (edge > config.radiusPx) return Infinity
  const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 },
    size = Math.max(16, Math.min(96, Math.sqrt(b.width * b.height)))
  const distance =
    edge / size +
    (0.1 * Math.hypot(cursor.x - center.x, cursor.y - center.y)) / (size + config.radiusPx)
  const gazeCost =
    gaze && Number.isFinite(gaze.x) && Number.isFinite(gaze.y)
      ? config.gazeWeight *
        Math.min(2, Math.hypot(gaze.x - center.x, gaze.y - center.y) / (size + config.radiusPx))
      : 0
  return distance + gazeCost + config.rolePriors[t.role]
}
/** Lower scores win; incumbent changes require a continuous score advantage. */
export class SnapSelector {
  private current: string | undefined
  private challenger: string | undefined
  private since = 0
  private lastT = -Infinity
  constructor(private readonly config: SnapConfig = DEFAULT_SNAP_CONFIG) {}
  reset(): void {
    this.current = undefined
    this.challenger = undefined
    this.lastT = -Infinity
  }
  update(
    cursor: Point,
    gaze: Readonly<Point> | undefined,
    candidates: readonly SnapCandidate[],
    t: number
  ): SnapCandidate | undefined {
    if (!Number.isFinite(t) || t < this.lastT) {
      this.reset()
      return undefined
    }
    if (t - this.lastT > this.config.cacheMaxAgeMs) this.reset()
    this.lastT = t
    let best: SnapCandidate | undefined,
      current: SnapCandidate | undefined,
      bestScore = Infinity,
      currentScore = Infinity
    for (const target of candidates) {
      const score = targetScore(cursor, gaze, target, this.config)
      if (!Number.isFinite(score)) continue
      const key = snapKey(target)
      if (key === this.current) {
        current = target
        currentScore = score
      }
      if (score < bestScore || (score === bestScore && best && key < snapKey(best))) {
        best = target
        bestScore = score
      }
    }
    if (!current) {
      this.current = best ? snapKey(best) : undefined
      this.challenger = undefined
      return best
    }
    if (
      best &&
      snapKey(best) !== this.current &&
      bestScore + this.config.switchMargin < currentScore
    ) {
      const key = snapKey(best)
      if (this.challenger !== key) {
        this.challenger = key
        this.since = t
      }
      if (t - this.since >= this.config.switchMs) {
        this.current = key
        this.challenger = undefined
        return best
      }
    } else this.challenger = undefined
    return current
  }
}
