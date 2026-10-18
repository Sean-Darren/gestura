import type { CalibrationProfile, FaceFrame, OverlayState, SnapBounds } from '@gestura/core'
import { DEFAULT_GESTURE_CONFIG, DEFAULT_POINTER_CONFIG } from '@gestura/core/config'
import type { GestureConfig } from '@gestura/core/config'
import { CornerDwell } from '@gestura/gestures'
import { PointerPipeline, headPose } from '@gestura/pointer'
import type { PauseController } from '../pause'
export type PointerFeedback = Pick<
  OverlayState,
  'mode' | 'cursor' | 'frozen' | 'dwellProgress' | 'click' | 'message' | 'gestureDiagnostics'
>
export class OverlayController {
  private readonly headCorner = new CornerDwell()
  private readonly mouseCorner = new CornerDwell()
  private profile: CalibrationProfile | undefined
  private soft: PointerPipeline | undefined
  private offset: { x: number; y: number } | undefined
  private lastSoft = -Infinity
  private lastFrame = -Infinity
  private afterPause = 0
  private lastPoint: { x: number; y: number } | null = null
  private readonly unsubscribe: () => void
  private state: OverlayState
  private lastPublish = -Infinity
  private headProgress = 0
  private mouseProgress = 0
  constructor(
    private readonly options: {
      config?: GestureConfig
      pause: PauseController
      now(): number
      display(): { width: number; height: number; scaleFactor: number }
      systemPoint(): { x: number; y: number }
      publish(state: OverlayState): void
      tracking(): boolean
    }
  ) {
    const d = options.display()
    this.state = {
      snap: null,
      mode: 'off',
      paused: options.pause.paused,
      frozen: false,
      dwellProgress: 0,
      pauseProgress: 0,
      cursor: null,
      click: null,
      message: 'Click gestures are off; calibrate then select a mode',
      width: d.width,
      height: d.height,
      pauseTargetSize: this.config.pauseTargetSize
    }
    this.unsubscribe = options.pause.subscribe((paused) => {
      this.state.paused = paused
      this.state.snap = null
      this.state.frozen = false
      this.state.dwellProgress = 0
      this.state.pauseProgress = 0
      this.headProgress = 0
      this.mouseProgress = 0
      this.state.click = null
      this.soft = undefined
      this.offset = undefined
      this.lastSoft = -Infinity
      this.lastFrame = -Infinity
      this.afterPause = options.now()
      this.headCorner.latch()
      this.mouseCorner.latch()
      this.emit(true)
    })
  }
  private get config(): GestureConfig {
    return this.options.config ?? DEFAULT_GESTURE_CONFIG
  }
  get snapshot(): OverlayState {
    return { ...this.state }
  }
  applyProfile(profile: CalibrationProfile): void {
    this.profile = profile
    this.soft = undefined
  }
  inCorner(point: { x: number; y: number }): boolean {
    const d = this.options.display(),
      s = this.config.pauseTargetSize
    return point.x >= d.width - s && point.x < d.width && point.y >= 0 && point.y < s
  }
  reservedPhysical(point: { x: number; y: number }): boolean {
    const scale = this.options.display().scaleFactor
    return this.inCorner({ x: point.x / scale, y: point.y / scale })
  }
  private emit(force = false): void {
    const now = this.options.now()
    if (force || now - this.lastPublish >= 50) {
      this.lastPublish = now
      this.options.publish({ ...this.state })
    }
  }
  feedback(value: PointerFeedback): void {
    const scale = this.options.display().scaleFactor
    this.state = {
      ...this.state,
      ...value,
      cursor: value.cursor ? { x: value.cursor.x / scale, y: value.cursor.y / scale } : null,
      click: value.click
        ? { ...value.click, x: value.click.x / scale, y: value.click.y / scale }
        : null
    }
    if (value.cursor && !this.options.pause.paused) {
      this.lastPoint = this.state.cursor
      this.corner(this.headCorner, this.state.cursor!, this.options.now())
    }
    this.emit()
  }
  setSnap(bounds: SnapBounds | null): void {
    const scale = this.options.display().scaleFactor
    this.state.snap = bounds
      ? {
          x: bounds.x / scale,
          y: bounds.y / scale,
          width: bounds.width / scale,
          height: bounds.height / scale
        }
      : null
    this.emit()
  }
  calibration(point: { x: number; y: number } | null): void {
    if (!point || this.options.pause.paused) return
    const d = this.options.display()
    this.lastPoint = { x: point.x * d.width, y: point.y * d.height }
    this.state.cursor = this.lastPoint
    this.corner(this.headCorner, this.lastPoint, this.options.now())
    this.emit()
  }
  private corner(dwell: CornerDwell, point: { x: number; y: number }, t: number): void {
    const result = dwell.update(this.inCorner(point), t, this.config.pauseDwellMs)
    if (dwell === this.headCorner) this.headProgress = result.progress
    else this.mouseProgress = result.progress
    this.state.pauseProgress = Math.max(this.headProgress, this.mouseProgress)
    if (result.toggle) this.options.pause.toggle()
  }
  pausedFrame(frame: FaceFrame): void {
    const now = this.options.now()
    if (
      !this.options.pause.paused ||
      !this.options.tracking() ||
      frame.tCapture < this.afterPause ||
      frame.tCapture <= this.lastFrame ||
      now - frame.tCapture > 250 ||
      frame.tInferDone > now
    )
      return
    this.lastFrame = frame.tCapture
    if (!frame.faceDetected) {
      this.soft = undefined
      this.offset = undefined
      this.state.cursor = null
      this.headCorner.latch()
      return
    }
    const d = this.options.display()
    if (!this.soft) {
      let neutral
      try {
        neutral = headPose(frame.matrix)
      } catch {
        return
      }
      this.soft = new PointerPipeline(
        { neutral, ...(this.profile ? { range: this.profile.range } : {}) },
        {
          bounds: { x: 0, y: 0, width: d.width, height: d.height },
          scaleFactor: 1,
          coordinateSpace: 'pixels'
        },
        { ...DEFAULT_POINTER_CONFIG, gazeEnabled: false }
      )
    }
    const command = this.soft.process(frame, now)
    if (!command) return
    if (!this.offset) {
      const anchor = this.lastPoint ?? { x: d.width / 2, y: d.height / 2 }
      this.offset = { x: anchor.x, y: anchor.y }
    }
    // Scale each half of the absolute head range around the paused cursor.
    // Both screen edges remain reachable even when pause began near an edge.
    const map = (value: number, size: number, anchor: number): number => {
      const u = (2 * value) / (size - 1) - 1
      return Math.max(0, Math.min(size - 1, anchor + u * (u < 0 ? anchor : size - 1 - anchor)))
    }
    const point = {
      x: map(command.x, d.width, this.offset.x),
      y: map(command.y, d.height, this.offset.y)
    }
    this.state.cursor = point
    this.lastSoft = now
    this.corner(this.headCorner, point, now)
    this.emit()
  }
  tick(): void {
    const now = this.options.now(),
      d = this.options.display()
    this.state.width = d.width
    this.state.height = d.height
    const system = this.options.systemPoint()
    this.corner(this.mouseCorner, system, now)
    if (this.options.pause.paused && now - this.lastSoft > 400) this.state.cursor = null
    this.emit()
  }
  dispose(): void {
    this.unsubscribe()
  }
}
