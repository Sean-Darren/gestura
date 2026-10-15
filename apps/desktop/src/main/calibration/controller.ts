import { eyeAspectRatios } from '@gestura/gestures'
import { CalibrationProfileSchema, CalibrationStateSchema } from '@gestura/core'
import type {
  CalibrationProfile,
  CalibrationState,
  FaceFrame,
  IpcPayloadFor,
  Pose
} from '@gestura/core'
import { DEFAULT_CALIBRATION_CONFIG, DEFAULT_POINTER_CONFIG } from '@gestura/core/config'
import { CalibrationWizard, PointerPipeline, headPose, irisFeatures } from '@gestura/pointer'
import type { PauseController } from '../pause'
import type { CalibrationStore } from './store'
export class CalibrationController {
  aspectRatio = 16 / 9
  private wizard: CalibrationWizard | undefined
  private virtual: PointerPipeline | undefined
  private stageKey = ''
  private provisional: Pose | undefined
  private cursor: CalibrationState['cursor'] = null
  private lighting: CalibrationState['lighting'] = 'unknown'
  private centered = false
  private detected = false
  private diagnosticsTime = -Infinity
  private latestFrame = -Infinity
  private afterResume = 0
  private error = ''
  private firstStarted = false
  private logging: boolean
  private disposed = false
  private saving = false
  private readonly unsubscribe: () => void
  constructor(
    private readonly options: {
      profile: CalibrationProfile | undefined
      store: CalibrationStore
      pause: PauseController
      now(): number
      display(): { width: number; height: number; scaleFactor: number }
      publish(state: CalibrationState): void
      camera(start: boolean): void
      fullScreen(active: boolean): void
      apply(profile: CalibrationProfile): void
      activate?(): void
      logging: boolean
    }
  ) {
    this.logging = options.logging
    let initial = true
    this.unsubscribe = options.pause.subscribe((paused) => {
      if (initial && !paused) return
      this.afterResume = options.now()
      this.latestFrame = -Infinity
      this.cursor = null
      this.virtual?.reset()
      this.wizard?.setPaused(paused, options.now())
      this.emit()
    })
    initial = false
  }
  get state(): CalibrationState {
    const w = this.wizard
    return CalibrationStateSchema.parse({
      firstRun: !this.options.profile,
      active: w?.active ?? false,
      stage: w?.stage ?? 'framing',
      paused: this.options.pause.paused,
      elapsedMs: w?.elapsedMs ?? 0,
      remainingMs: w?.remainingMs ?? 0,
      index: w?.index ?? 0,
      message: this.error || w?.message || 'Start calibration to set up head movement and dwell.',
      faceCentered: this.centered,
      faceDetected: this.detected,
      lighting: this.lighting,
      gazeEnabled: w?.active ? w.gazeEnabled : (this.options.profile?.gaze.enabled ?? false),
      loggingEnabled: this.logging,
      cursor: this.cursor,
      target: w?.target ?? null,
      dwellProgress: w?.dwellProgress ?? 0
    })
  }
  private emit(): void {
    if (!this.disposed) this.options.publish(this.state)
  }
  firstRun(): void {
    if (!this.options.profile && !this.firstStarted) {
      this.firstStarted = true
      this.start()
    }
  }
  start(): void {
    if (this.disposed || this.options.pause.paused || this.saving) return
    this.error = ''
    this.wizard = new CalibrationWizard(this.options.now(), this.options.display())
    this.provisional = undefined
    this.virtual = undefined
    this.stageKey = ''
    this.cursor = null
    this.latestFrame = -Infinity
    this.centered = false
    this.detected = false
    this.lighting = 'unknown'
    this.diagnosticsTime = -Infinity
    this.options.fullScreen(true)
    this.options.camera(true)
    this.emit()
  }
  diagnostics(value: IpcPayloadFor<'vision:diagnostics'>): void {
    if (
      this.options.pause.paused ||
      value.tCapture > this.options.now() ||
      value.tCapture < this.afterResume ||
      value.tCapture < this.diagnosticsTime ||
      this.options.now() - value.tCapture > 1000
    )
      return
    this.diagnosticsTime = value.tCapture
    this.lighting =
      value.luminance < DEFAULT_CALIBRATION_CONFIG.darkLuminance
        ? 'dark'
        : value.luminance > DEFAULT_CALIBRATION_CONFIG.brightLuminance
          ? 'bright'
          : 'good'
  }
  consume(frame: FaceFrame): void {
    const w = this.wizard,
      now = this.options.now()
    if (
      !w?.active ||
      this.disposed ||
      this.options.pause.paused ||
      frame.tCapture < this.afterResume ||
      frame.tCapture <= this.latestFrame ||
      now - frame.tCapture > 250 ||
      frame.tInferDone > now
    )
      return
    this.latestFrame = frame.tCapture
    this.detected = frame.faceDetected
    if (!frame.faceDetected) {
      w.interrupt()
      this.cursor = null
      this.centered = false
      this.virtual?.reset()
      return
    }
    let pose: Pose
    try {
      pose = headPose(frame.matrix)
    } catch {
      w.interrupt()
      this.cursor = null
      this.detected = false
      this.centered = false
      return
    }
    this.provisional ??= pose
    let minX = 1,
      minY = 1,
      maxX = 0,
      maxY = 0
    for (let i = 0; i < 478; i++) {
      minX = Math.min(minX, frame.landmarks[i * 3]!)
      maxX = Math.max(maxX, frame.landmarks[i * 3]!)
      minY = Math.min(minY, frame.landmarks[i * 3 + 1]!)
      maxY = Math.max(maxY, frame.landmarks[i * 3 + 1]!)
    }
    this.centered =
      Math.abs((minX + maxX) / 2 - 0.5) < 0.18 &&
      Math.abs((minY + maxY) / 2 - 0.5) < 0.2 &&
      maxX - minX > 0.1 &&
      minX > 0.02 &&
      maxX < 0.98 &&
      minY > 0.02 &&
      maxY < 0.98
    if (now - this.diagnosticsTime > 1500) this.lighting = 'unknown'
    const ear = eyeAspectRatios(frame, this.aspectRatio)
    w.observe({
      ...(ear ? { ear: { ...ear, aspectRatio: this.aspectRatio } } : {}),
      t: now,
      pose,
      centered: this.centered,
      lightingGood: this.lighting === 'good',
      features: irisFeatures(frame, pose),
      left: frame.blendshapes.eyeBlinkLeft ?? 0,
      right: frame.blendshapes.eyeBlinkRight ?? 0
    })
    const calibrated = [
      'gaze',
      'deliberate-blinks',
      'natural-blinks',
      'quick-test',
      'review'
    ].includes(w.stage)
    const neutral = w.stage === 'framing' || w.stage === 'neutral' ? this.provisional : w.neutral
    const key = calibrated ? (w.stage === 'quick-test' ? 'test' : 'calibrated') : w.stage
    if (key !== this.stageKey || !this.virtual) {
      const d = w.display
      this.virtual = new PointerPipeline(
        { neutral, ...(calibrated ? { range: w.range } : {}) },
        {
          bounds: { x: 0, y: 0, width: d.width * d.scaleFactor, height: d.height * d.scaleFactor },
          scaleFactor: d.scaleFactor,
          coordinateSpace: 'pixels'
        },
        { ...DEFAULT_POINTER_CONFIG, gazeEnabled: w.stage === 'quick-test' && w.gazeEnabled },
        w.mapping ?? undefined
      )
      this.stageKey = key
    }
    const command = this.virtual.process(frame, now)
    if (command) {
      this.cursor = {
        x: command.x / (w.display.width * w.display.scaleFactor - 1),
        y: command.y / (w.display.height * w.display.scaleFactor - 1)
      }
      w.observePoint(this.cursor, now)
    }
  }
  tick(): void {
    if (!this.wizard?.active) return
    this.wizard.tick(this.options.now())
    if (this.options.now() - this.latestFrame > 250) {
      this.cursor = null
      this.detected = false
      this.centered = false
    }
    this.emit()
  }
  fail(message: string): void {
    if (this.wizard?.active) {
      this.error = message.slice(0, 500)
      this.wizard.interrupt()
      this.cursor = null
      this.detected = false
      this.centered = false
      this.emit()
    }
  }
  async control(value: IpcPayloadFor<'calibration:control'>): Promise<void> {
    if (this.disposed || this.saving) return
    try {
      if (value.operation === 'start') {
        this.start()
        return
      }
      if (value.operation === 'clear-log') {
        await this.options.store.clearLog()
        this.error = 'Local duration log cleared'
        this.emit()
        return
      }
      if (value.operation === 'logging') {
        const previous = this.logging
        this.logging = value.enabled
        try {
          if (this.options.profile) {
            const updated = { ...this.options.profile, loggingEnabled: value.enabled }
            await this.options.store.save(updated)
            this.options.profile = updated
          }
        } catch (error) {
          this.logging = previous
          throw error
        }
        this.emit()
        return
      }
      if (value.operation === 'gaze' && !this.wizard?.active && this.options.profile) {
        const profile = CalibrationProfileSchema.parse({
          ...this.options.profile,
          pointer: { ...this.options.profile.pointer, gazeEnabled: value.enabled },
          gaze: { ...this.options.profile.gaze, enabled: value.enabled }
        })
        await this.options.store.save(profile)
        this.options.profile = profile
        this.options.apply(profile)
        this.emit()
        return
      }
      const w = this.wizard
      if (!w) return
      if (value.operation === 'cancel') {
        w.cancel()
        this.options.camera(false)
        this.options.fullScreen(false)
        this.emit()
        return
      }
      if (this.options.pause.paused) return
      this.error = ''
      if (value.operation === 'gaze') {
        w.setGaze(value.enabled)
        this.emit()
        return
      }
      if (value.operation === 'next') w.next()
      else if (value.operation === 'retry') {
        w.retry()
        this.stageKey = ''
        this.options.camera(true)
      } else if (value.operation === 'save') {
        this.saving = true
        this.error = 'Saving profile locally…'
        this.emit()
        const profile = CalibrationProfileSchema.parse({
          ...w.profile(this.options.now()),
          loggingEnabled: this.logging
        })
        await this.options.store.save(profile)
        this.error = ''
        this.options.profile = profile
        this.options.apply(profile)
        w.complete()
        if (this.logging) {
          try {
            await this.options.store.logDuration(profile)
          } catch {
            this.error = 'Profile saved; duration log could not be written'
          }
        }
        this.options.camera(true)
        this.options.activate?.()
        this.options.fullScreen(false)
      }
      this.emit()
    } catch (error) {
      this.error = (error instanceof Error ? error.message : 'Calibration operation failed').slice(
        0,
        500
      )
      this.emit()
    } finally {
      this.saving = false
    }
  }
  displayChanged(): void {
    if (this.wizard?.active) {
      this.wizard.cancel()
      this.cursor = null
      this.options.camera(false)
      this.options.fullScreen(false)
      this.error = 'Display configuration changed. Start calibration again.'
      this.emit()
    }
  }
  dispose(): void {
    this.disposed = true
    this.unsubscribe()
    this.virtual = undefined
    this.wizard = undefined
  }
}
