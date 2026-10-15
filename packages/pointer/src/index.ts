import type {
  CursorCommand,
  FaceFrame,
  PointerDisplay,
  PointerProfile,
  GazeMapping
} from '@gestura/core'
import { DEFAULT_POINTER_CONFIG } from '@gestura/core/config'
import type { PointerConfig } from '@gestura/core/config'
import { OneEuroFilter } from './one-euro'
import { headPose, mapToScreen, clampPoint } from './pose'
import type { Point } from './pose'
import { irisFeatures, predictGaze } from './regression'
import { physicalBounds } from './pose'
import { estimateGaze, GazeJump } from './gaze'
export * from './pose'
export * from './one-euro'
export * from './gaze'
export const packageName = '@gestura/pointer'

export class PointerPipeline {
  private readonly x: OneEuroFilter
  private readonly y: OneEuroFilter
  private readonly gaze: GazeJump
  private lastCapture = -Infinity
  private offset: Point = { x: 0, y: 0 }
  private cursor: Point | undefined
  private latestGaze: Point | undefined
  get gazePoint(): Readonly<Point> | undefined {
    return this.latestGaze
  }
  constructor(
    private readonly profile: PointerProfile,
    private readonly display: PointerDisplay,
    private readonly config: PointerConfig = DEFAULT_POINTER_CONFIG,
    private readonly mapping?: GazeMapping
  ) {
    this.x = new OneEuroFilter(config)
    this.y = new OneEuroFilter(config)
    this.gaze = new GazeJump(config)
  }
  reset(): void {
    this.x.reset()
    this.y.reset()
    this.gaze.reset()
    this.lastCapture = -Infinity
    this.offset = { x: 0, y: 0 }
    this.cursor = undefined
    this.latestGaze = undefined
  }
  hold(tCapture: number): void {
    if (!Number.isFinite(tCapture) || tCapture <= this.lastCapture) return
    this.lastCapture = tCapture
    if (this.cursor) {
      this.x.filter(this.cursor.x, tCapture)
      this.y.filter(this.cursor.y, tCapture)
    }
    this.gaze.reset()
  }
  process(frame: FaceFrame, tPointerDone: number): CursorCommand | undefined {
    if (frame.tCapture <= this.lastCapture) return undefined
    if (!frame.faceDetected) {
      this.reset()
      this.lastCapture = frame.tCapture
      return undefined
    }
    if (frame.tCapture - this.lastCapture > this.config.staleFrameMs) this.reset()
    this.lastCapture = frame.tCapture
    let pose
    try {
      pose = headPose(frame.matrix)
    } catch {
      this.reset()
      this.lastCapture = frame.tCapture
      return undefined
    }
    const mapped = mapToScreen(pose, this.profile, this.display, this.config)
    let point = clampPoint(
      { x: mapped.x + this.offset.x, y: mapped.y + this.offset.y },
      this.display
    )
    let gazePoint: Point | undefined
    if (this.config.gazeEnabled) {
      if (this.mapping) {
        const features = irisFeatures(frame, pose)
        if (features) {
          const normalized = predictGaze(features, this.mapping),
            b = physicalBounds(this.display)
          gazePoint = clampPoint(
            { x: b.x + normalized.x * (b.width - 1), y: b.y + normalized.y * (b.height - 1) },
            this.display
          )
        }
      } else gazePoint = estimateGaze(frame, pose, this.display, this.config)
    }
    this.latestGaze = gazePoint
    const jump = this.gaze.update(gazePoint, this.cursor ?? point, frame.tCapture)
    let kind: CursorCommand['kind'] = 'head'
    if (jump) {
      this.offset = { x: jump.x - mapped.x, y: jump.y - mapped.y }
      this.x.reset()
      this.y.reset()
      point = jump
      kind = 'gaze-jump'
    }
    point = clampPoint(
      { x: this.x.filter(point.x, frame.tCapture), y: this.y.filter(point.y, frame.tCapture) },
      this.display
    )
    this.cursor = point
    return { ...point, kind, tCapture: frame.tCapture, tInferDone: frame.tInferDone, tPointerDone }
  }
}

export * from './regression'
export * from './calibration'

export * from './snap'
