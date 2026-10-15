import { GestureEngine } from '@gestura/gestures'
import type { SpeechState } from '@gestura/gestures'
import type { GestureEvent, OverlayState } from '@gestura/core'
import { GestureEventSchema } from '@gestura/core'
import { DEFAULT_GESTURE_CONFIG, GestureConfigSchema } from '@gestura/core/config'
import type { GestureConfig } from '@gestura/core/config'
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
  private gesture: GestureEngine | undefined
  private gestureConfig: GestureConfig = DEFAULT_GESTURE_CONFIG
  private lastPoint: { x: number; y: number } | undefined
  private lastMoveCapture: number | undefined
  private speed = 0
  private lastClick: OverlayState['click'] = null
  private dwellProgress = 0
  private gestureMessage = ''
  private speech: SpeechState = 'unknown'
  aspectRatio = 16 / 9
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
      latencySample?(time: number, latencyMs: number): void
      config?: PointerConfig
      profile?: PointerProfile
      gestures?: GestureConfig
      feedback?(
        state: Pick<
          OverlayState,
          'mode' | 'cursor' | 'frozen' | 'dwellProgress' | 'click' | 'message'
        >
      ): void
      reserved?(point: { x: number; y: number }): boolean
      snapping?: {
        update(
          point: { x: number; y: number },
          display: PointerDisplay,
          gaze: Readonly<{ x: number; y: number }> | undefined,
          frozen: boolean
        ): void
        click(point: { x: number; y: number }): { x: number; y: number }
        reset(): void
      }
      toggleListening?(): void
    }
  ) {
    this.gestureConfig = GestureConfigSchema.parse(options.gestures ?? DEFAULT_GESTURE_CONFIG)
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
    this.setGestureMode(this.gestureConfig.mode)
  }
  setGestureMode(mode: 'off' | 'blink' | 'dwell'): void {
    this.reset()
    if (mode !== 'off' && !this.calibration) {
      this.gestureConfig = { ...this.gestureConfig, mode: 'off' }
      this.gesture = undefined
      this.feedback(false, 0, 'Calibrate before enabling click gestures')
      return
    }
    if (
      mode === 'blink' &&
      this.calibration!.blink.minLongBlinkMs > this.gestureConfig.maxLongBlinkMs
    ) {
      this.gestureConfig = { ...this.gestureConfig, mode: 'off' }
      this.gesture = undefined
      this.feedback(
        false,
        0,
        'Calibrated blink minimum exceeds the maximum; recalibrate or adjust timing'
      )
      return
    }
    this.gestureConfig = GestureConfigSchema.parse({ ...this.gestureConfig, mode })
    this.gesture = this.calibration
      ? new GestureEngine(this.calibration.blink, this.gestureConfig)
      : undefined
    this.feedback(
      false,
      0,
      mode === 'off'
        ? 'Click gestures are off'
        : `${mode} click mode; jaw listening awaits Phase 3 speech state`
    )
  }
  setSpeechState(state: SpeechState): void {
    this.speech = state
  }
  setDragging(active: boolean): void {
    if (
      !this.enabled ||
      this.replay ||
      this.options.pause.paused ||
      !this.lastPoint ||
      !this.gesture
    )
      return
    for (const event of this.gesture.setDragging(active, this.lastPoint, this.options.now()))
      this.dispatchGesture(event)
  }
  private dispatchGesture(value: GestureEvent): void {
    const event = GestureEventSchema.parse(value)
    if (event.kind === 'mouseUp') {
      this.options.bridge.mouseUp('left')
      return
    }
    if (!this.enabled || this.replay || this.options.pause.paused || !this.display) return
    if (event.kind === 'click' || event.kind === 'mouseDown') {
      if (this.options.reserved?.(event)) return
      const destination =
        event.kind === 'click' ? (this.options.snapping?.click(event) ?? event) : event
      if (this.options.reserved?.(destination)) return
      const point = toNativePoint(destination.x, destination.y, this.display)
      if (!this.options.bridge.moveTo(point.x, point.y)) return
      if (event.kind === 'click') {
        if (this.options.bridge.click(event.button))
          this.lastClick = { x: destination.x, y: destination.y, button: event.button, t: event.t }
      } else this.options.bridge.mouseDown('left')
    }
    if (event.kind === 'toggleListening') this.options.toggleListening?.()
    // toggleListening remains an internal Phase 3 event; it never confirms an ActionGate proposal.
  }
  private feedback(frozen: boolean, dwellProgress: number, message = ''): void {
    if (message) this.gestureMessage = message
    if (
      this.lastPoint &&
      this.display &&
      this.enabled &&
      !this.replay &&
      !this.options.pause.paused
    )
      this.options.snapping?.update(this.lastPoint, this.display, this.pipeline?.gazePoint, frozen)
    this.options.feedback?.({
      mode: this.gestureConfig.mode,
      cursor: this.lastPoint ?? null,
      frozen,
      dwellProgress,
      click: this.lastClick,
      message: this.gestureMessage
    })
  }
  get metrics(): PointerMetrics {
    return this.last
  }
  private reset(): void {
    if (this.gesture)
      for (const event of this.gesture.reset(this.lastPoint, this.options.now())) {
        try {
          this.dispatchGesture(event)
        } catch {
          this.lastClick = null
        }
      }
    this.options.snapping?.reset()
    this.lastPoint = undefined
    this.lastMoveCapture = undefined
    this.speed = 0
    this.dwellProgress = 0
    this.lastClick = null
    this.feedback(false, 0)
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
    if (!this.replay && this.lastPoint && this.gesture) {
      if (this.options.reserved?.(this.lastPoint)) {
        for (const event of this.gesture.reset(this.lastPoint, frame.tCapture)) {
          try {
            this.dispatchGesture(event)
          } catch {
            this.setEnabled(false)
            return
          }
        }
      } else {
        const result = this.gesture.update(
          frame,
          this.lastPoint,
          this.speed,
          this.aspectRatio,
          this.speech
        )
        try {
          for (const event of result.events) this.dispatchGesture(event)
        } catch {
          this.setEnabled(false)
          return
        }
        this.dwellProgress = result.dwellProgress
        this.feedback(result.frozen, result.dwellProgress)
        if (result.frozen) {
          this.pipeline.hold(frame.tCapture)
          this.speed = 0
          this.lastMoveCapture = frame.tCapture
          return
        }
      }
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
      this.speed =
        this.lastPoint && this.lastMoveCapture !== undefined
          ? (Math.hypot(command.x - this.lastPoint.x, command.y - this.lastPoint.y) * 1000) /
            Math.max(1, frame.tCapture - this.lastMoveCapture)
          : 0
      this.lastPoint = { x: command.x, y: command.y }
      this.lastMoveCapture = frame.tCapture
      this.feedback(false, this.dwellProgress)
      this.options.latencySample?.(tMoveSent, Math.max(0, tMoveSent - command.tCapture))
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
