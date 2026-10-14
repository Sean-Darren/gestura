import {
  CalibrationProfileSchema,
  CursorCommandSchema,
  PointerDisplaySchema,
  PointerProfileSchema
} from '@gestura/core'
import type {
  CalibrationProfile,
  FaceFrame,
  PointerDisplay,
  PointerMetrics,
  PointerProfile
} from '@gestura/core'
import { DEFAULT_POINTER_CONFIG, PointerConfigSchema } from '@gestura/core/config'
import type { PointerConfig } from '@gestura/core/config'
import { PointerPipeline } from '@gestura/pointer'
import type { NativeBridge } from '../native'
import type { PauseController } from '../pause'

export function toNativePoint(
  x: number,
  y: number,
  display: PointerDisplay
): { x: number; y: number } {
  const scale = display.coordinateSpace === 'points' ? display.scaleFactor : 1
  return { x: x / scale, y: y / scale }
}
export class PointerController {
  private pipeline: PointerPipeline | undefined
  private display: PointerDisplay | undefined
  private disposed = false
  private enabled = false
  private replay = false
  private active = false
  private latestCapture = -Infinity
  private resumeAfter = 0
  private readonly samples: { time: number; latency: number }[] = []
  private readonly unsubscribe: () => void
  private lastPublish = -Infinity
  private last: PointerMetrics = {
    enabled: false,
    samples: 0,
    latencyP50Ms: 0,
    latencyP95Ms: 0,
    tCapture: 0,
    tInferDone: 0,
    tPointerDone: 0,
    tMoveSent: 0,
    message: 'Pointer control is off',
    replay: false
  }
  private config: PointerConfig
  private calibration: CalibrationProfile | undefined
  constructor(
    private readonly options: {
      bridge: NativeBridge
      pause: PauseController
      now(): number
      publish(metrics: PointerMetrics): void
      config?: PointerConfig
      profile?: PointerProfile
    }
  ) {
    // Live gaze remains unavailable until the calibration step supplies a validated profile.
    this.config = {
      ...PointerConfigSchema.parse(options.config ?? DEFAULT_POINTER_CONFIG),
      gazeEnabled: false
    }
    PointerProfileSchema.parse(options.profile ?? { neutral: { yaw: 0, pitch: 0 } })
    let initializing = true
    this.unsubscribe = options.pause.subscribe((paused) => {
      if (initializing && !paused) return
      this.resumeAfter = options.now()
      this.reset()
      this.publish(
        paused ? 'Globally paused; no cursor movement' : 'Resumed; waiting for a fresh frame'
      )
    })
    initializing = false
  }
  applyCalibration(value: CalibrationProfile): void {
    this.setEnabled(false)
    this.calibration = CalibrationProfileSchema.parse(value)
    this.config = { ...this.calibration.pointer, gazeEnabled: this.calibration.gaze.enabled }
  }
  get metrics(): PointerMetrics {
    return this.last
  }
  private reset(): void {
    this.pipeline?.reset()
    this.samples.length = 0
    this.latestCapture = -Infinity
  }
  private publish(message: string): void {
    this.last = {
      ...this.last,
      enabled: this.enabled,
      replay: this.replay,
      message,
      samples: 0,
      latencyP50Ms: 0,
      latencyP95Ms: 0,
      tCapture: 0,
      tInferDone: 0,
      tPointerDone: 0,
      tMoveSent: 0
    }
    this.options.publish(this.last)
  }
  setEnabled(enabled: boolean): void {
    if (this.disposed) return
    this.enabled = false
    this.reset()
    if (!enabled) {
      this.publish('Pointer control is off')
      return
    }
    if (this.options.pause.paused) {
      this.publish('Resume global pause before enabling pointer control')
      return
    }
    try {
      if (!this.options.bridge.hasInputPermission())
        throw new Error('Accessibility/input permission is required; grant it in system settings')
      const primary = this.options.bridge.getDisplays()?.find((display) => display.primary)
      if (!primary) throw new Error('Primary display is unavailable')
      this.display = PointerDisplaySchema.parse({
        bounds: primary.bounds,
        scaleFactor: primary.scaleFactor,
        coordinateSpace: primary.coordinateSpace
      })
      this.pipeline = new PointerPipeline(
        this.calibration
          ? { neutral: this.calibration.neutral, range: this.calibration.range }
          : (this.options.profile ?? { neutral: { yaw: 0, pitch: 0 } }),
        this.display,
        this.config,
        this.calibration?.gaze.mapping ?? undefined
      )
      this.enabled = true
      this.publish(
        this.replay ? 'Replay preview; no native movement' : 'Pointer enabled; waiting for a face'
      )
    } catch (error) {
      this.publish(
        error instanceof Error ? error.message.slice(0, 500) : 'Native input is unavailable'
      )
    }
  }
  setSource(state: string): void {
    if (this.disposed) return
    const replay = state === 'replaying'
    const active = replay || state === 'running'
    if (this.replay !== replay || this.active !== active) {
      this.replay = replay
      this.active = active
      this.reset()
      this.publish(
        replay
          ? 'Replay preview; no native movement'
          : active
            ? 'Waiting for a fresh face frame'
            : 'Tracking is inactive; no cursor movement'
      )
    }
  }
  invalidateDisplay(): void {
    if (this.enabled) {
      this.setEnabled(false)
      this.publish('Display configuration changed; enable pointer control again')
    }
  }
  consume(frame: FaceFrame): void {
    if (
      !this.enabled ||
      !this.active ||
      this.options.pause.paused ||
      !this.pipeline ||
      !this.display
    )
      return
    const now = this.options.now()
    if (
      !this.replay &&
      (frame.tCapture < this.resumeAfter ||
        now - frame.tCapture > this.config.staleFrameMs ||
        frame.tInferDone > now ||
        frame.tCapture <= this.latestCapture)
    )
      return
    this.latestCapture = frame.tCapture
    if (!frame.faceDetected) {
      this.reset()
      this.latestCapture = frame.tCapture
      if (this.last.message !== 'Face lost; no cursor movement')
        this.publish('Face lost; no cursor movement')
      return
    }
    const result = this.pipeline.process(frame, now)
    if (!result) return
    const command = CursorCommandSchema.parse({ ...result, tPointerDone: this.options.now() })
    if (this.replay) {
      if (now - this.lastPublish >= 100) {
        this.publish(
          `Replay preview at ${command.x.toFixed(0)}, ${command.y.toFixed(0)} px; no native movement`
        )
        this.lastPublish = now
      }
      return
    }
    try {
      if (this.options.pause.paused) return
      const point = toNativePoint(command.x, command.y, this.display)
      const tMoveSent = this.options.now()
      if (!this.options.bridge.moveTo(point.x, point.y)) return
      this.samples.push({ time: tMoveSent, latency: Math.max(0, tMoveSent - command.tCapture) })
      while (
        this.samples.length > 240 ||
        (this.samples[0] && tMoveSent - this.samples[0].time > 2000)
      )
        this.samples.shift()
      if (now - this.lastPublish >= 100) {
        const sorted = this.samples.map((sample) => sample.latency).sort((a, b) => a - b)
        const percentile = (p: number): number => sorted[Math.ceil(sorted.length * p) - 1] ?? 0
        this.last = {
          enabled: true,
          replay: false,
          samples: sorted.length,
          latencyP50Ms: percentile(0.5),
          latencyP95Ms: percentile(0.95),
          tCapture: command.tCapture,
          tInferDone: command.tInferDone,
          tPointerDone: command.tPointerDone,
          tMoveSent,
          message: 'Moving on the primary display'
        }
        this.options.publish(this.last)
        this.lastPublish = now
      }
    } catch (error) {
      this.setEnabled(false)
      this.publish(error instanceof Error ? error.message.slice(0, 500) : 'Cursor dispatch failed')
    }
  }
  tick(): void {
    if (
      !this.replay &&
      this.last.samples > 0 &&
      this.options.now() - this.latestCapture > this.config.staleFrameMs
    ) {
      this.reset()
      this.publish('No fresh face frames; no cursor movement')
    }
  }
  dispose(): void {
    this.disposed = true
    this.enabled = false
    this.reset()
    this.unsubscribe()
  }
}
