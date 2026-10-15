import { CalibrationProfileSchema } from '@gestura/core'
import type { CalibrationProfile, CalibrationStage, GazeMapping, Pose } from '@gestura/core'
import {
  DEFAULT_CALIBRATION_CONFIG,
  DEFAULT_POINTER_CONFIG,
  DEFAULT_GESTURE_CONFIG
} from '@gestura/core/config'
import { fitRidge } from './regression'
import type { GazeSample } from './regression'
import type { Point } from './pose'
export const GAZE_DOTS: readonly Point[] = [0.15, 0.5, 0.85].flatMap((y) =>
  [0.15, 0.5, 0.85].map((x) => ({ x, y }))
)
export const TEST_TARGETS: readonly Point[] = [
  { x: 0.15, y: 0.4 },
  { x: 0.85, y: 0.4 },
  { x: 0.5, y: 0.6 },
  { x: 0.15, y: 0.8 },
  { x: 0.85, y: 0.8 }
]
export const RANGE_DIRECTIONS = ['left', 'right', 'up', 'down'] as const
export interface CalibrationObservation {
  ear?: { left: number; right: number; aspectRatio: number }
  t: number
  pose: Pose
  centered: boolean
  lightingGood: boolean
  features: number[] | undefined
  left: number
  right: number
}
function quantile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
}
export class CalibrationWizard {
  stage: CalibrationStage = 'framing'
  index = 0
  message = 'Center your face and check the lighting. Dwell on Continue when ready.'
  neutral: Pose = { yaw: 0, pitch: 0 }
  range = { left: 25, right: 25, up: 20, down: 20 }
  gazeEnabled = false
  mapping: GazeMapping | null = null
  paused = false
  stepElapsed = 0
  private now: number
  private lastFrame: number | undefined
  private faceReady = false
  private earSamples: { left: number; right: number; aspectRatio: number }[] = []
  private ear: CalibrationProfile['blink']['ear']
  private poses: Pose[] = []
  private features: number[][] = []
  private gazeSamples: GazeSample[] = []
  private deliberate: number[] = []
  private natural: number[] = []
  private closedSince: number | undefined
  private closedScores: number[] = []
  private openScores: number[] = []
  private dwellSince: number | undefined
  dwellProgress = 0
  private blink = {
    closedScore: 0.6,
    openScore: 0.3,
    minLongBlinkMs: 400,
    naturalMaxMs: 0,
    deliberateMs: [] as number[],
    naturalObservationMs: 10000 as const
  }
  readonly config = DEFAULT_CALIBRATION_CONFIG
  constructor(
    readonly startedAt: number,
    readonly display: { width: number; height: number; scaleFactor: number }
  ) {
    this.now = startedAt
  }
  get elapsedMs(): number {
    return Math.max(0, this.now - this.startedAt)
  }
  get active(): boolean {
    return !['complete', 'cancelled'].includes(this.stage)
  }
  get target(): Point | null {
    return this.stage === 'gaze'
      ? (GAZE_DOTS[this.index] ?? null)
      : this.stage === 'quick-test'
        ? (TEST_TARGETS[this.index] ?? null)
        : null
  }
  get remainingMs(): number {
    const duration =
      this.stage === 'neutral'
        ? 3000
        : this.stage === 'range'
          ? this.config.rangeMs
          : this.stage === 'gaze'
            ? 1500
            : this.stage === 'natural-blinks'
              ? 10000
              : 0
    return Math.max(0, duration - this.stepElapsed)
  }
  tick(t: number): void {
    if (t >= this.now) this.now = t
    if (this.lastFrame !== undefined && t - this.lastFrame > 250) this.interrupt()
  }
  setPaused(paused: boolean, t: number): void {
    this.tick(t)
    this.paused = paused
    this.lastFrame = undefined
    this.closedSince = undefined
    this.dwellSince = undefined
    this.dwellProgress = 0
  }
  setGaze(enabled: boolean): void {
    if (this.stage === 'framing') {
      this.gazeEnabled = enabled
      this.mapping = null
    }
  }
  private enter(stage: CalibrationStage): void {
    if (stage === 'neutral') {
      this.earSamples = []
      this.ear = undefined
    }
    this.stage = stage
    this.index = 0
    this.stepElapsed = 0
    this.poses = []
    this.features = []
    this.lastFrame = undefined
    this.closedSince = undefined
    this.dwellSince = undefined
    this.dwellProgress = 0
    const messages: Record<CalibrationStage, string> = {
      framing: 'Center your face and check the lighting.',
      neutral: 'Hold your comfortable resting pose for three seconds.',
      range: 'Turn comfortably toward the indicated edge. Do not strain.',
      gaze: 'Look at the dot. Keep your head comfortably still.',
      'deliberate-blinks': 'Make three deliberate long blinks, reopening your eyes after each.',
      'natural-blinks': 'Relax and blink naturally for ten seconds.',
      'quick-test': 'Move the pointer onto each target and dwell for one second.',
      review: 'Five targets selected. Dwell on Save profile to finish.',
      complete: 'Calibration saved.',
      cancelled: 'Calibration cancelled.'
    }
    this.message = messages[stage]
  }
  next(): void {
    if (!this.paused && this.stage === 'framing' && this.faceReady) this.enter('neutral')
  }
  retry(): void {
    if (this.stage === 'framing') {
      this.message = 'Check camera permission, framing and lighting.'
      return
    }
    if (this.stage === 'neutral') this.enter('neutral')
    else if (this.stage === 'range') this.enter('range')
    else if (this.stage === 'gaze') {
      this.gazeSamples = []
      this.mapping = null
      this.enter('gaze')
    } else if (this.stage === 'deliberate-blinks' || this.stage === 'natural-blinks') {
      this.deliberate = []
      this.natural = []
      this.closedScores = []
      this.openScores = []
      this.enter('deliberate-blinks')
    } else if (this.stage === 'quick-test' || this.stage === 'review') this.enter('quick-test')
  }
  cancel(): void {
    this.enter('cancelled')
  }
  interrupt(): void {
    this.faceReady = false
    this.lastFrame = undefined
    this.closedSince = undefined
    this.dwellSince = undefined
    this.dwellProgress = 0
    if (['neutral', 'range', 'gaze', 'natural-blinks'].includes(this.stage)) {
      this.stepElapsed = 0
      this.poses = []
      if (this.stage === 'neutral') this.earSamples = []
      this.features = []
      if (this.stage === 'natural-blinks') this.natural = []
    }
  }
  observe(observation: CalibrationObservation): void {
    const { t, pose, centered, lightingGood, features, left, right } = observation
    if (this.paused || !this.active || t < this.now) return
    const dt = this.lastFrame === undefined ? 0 : Math.max(0, t - this.lastFrame)
    this.tick(t)
    if (dt > 250) this.interrupt()
    this.lastFrame = t
    this.faceReady = centered && lightingGood
    if (this.stage === 'framing') return
    if (!lightingGood || (this.stage === 'neutral' && !centered)) {
      this.interrupt()
      this.message = 'Recenter your face/check lighting; this capture will restart.'
      return
    }
    this.stepElapsed += dt <= 250 ? dt : 0
    if (this.stage === 'neutral') {
      if (
        observation.ear &&
        observation.ear.left > 0.05 &&
        observation.ear.right > 0.05 &&
        left < 0.3 &&
        right < 0.3 &&
        this.earSamples.length < 300
      )
        this.earSamples.push(observation.ear)
      this.poses.push(pose)
      if (this.poses.length > 300) this.poses.shift()
      const yaws = this.poses.map((p) => p.yaw),
        pitches = this.poses.map((p) => p.pitch)
      if (
        quantile(yaws, 0.9) - quantile(yaws, 0.1) > 2 ||
        quantile(pitches, 0.9) - quantile(pitches, 0.1) > 2
      ) {
        this.poses = [pose]
        this.earSamples = []
        this.stepElapsed = 0
        this.message = 'Hold still; neutral capture restarted.'
      }
      if (this.stepElapsed >= 3000 && this.poses.length >= this.config.minSamples) {
        this.neutral = { yaw: quantile(yaws, 0.5), pitch: quantile(pitches, 0.5) }
        if (this.earSamples.length >= this.config.minSamples)
          this.ear = {
            left: quantile(
              this.earSamples.map((e) => e.left),
              0.5
            ),
            right: quantile(
              this.earSamples.map((e) => e.right),
              0.5
            ),
            aspectRatio: this.earSamples[0]!.aspectRatio,
            closedRatio: DEFAULT_GESTURE_CONFIG.earClosedRatio,
            openRatio: DEFAULT_GESTURE_CONFIG.earOpenRatio
          }
        this.enter('range')
      }
    } else if (this.stage === 'range') {
      this.poses.push(pose)
      if (this.poses.length > 600) this.poses.shift()
      if (this.stepElapsed >= this.config.rangeMs) {
        const dir = RANGE_DIRECTIONS[this.index]!
        const values = this.poses.map((p) =>
          dir === 'left'
            ? this.neutral.yaw - p.yaw
            : dir === 'right'
              ? p.yaw - this.neutral.yaw
              : dir === 'up'
                ? this.neutral.pitch - p.pitch
                : p.pitch - this.neutral.pitch
        )
        const extent = quantile(values, 0.9)
        if (this.poses.length < this.config.minSamples || extent < 1 || extent > 85) {
          this.stepElapsed = 0
          this.poses = []
          this.message = 'Not enough comfortable movement captured. Repeat this direction.'
          return
        }
        this.range[dir] = extent
        this.index++
        this.stepElapsed = 0
        this.poses = []
        if (this.index === 4) this.enter(this.gazeEnabled ? 'gaze' : 'deliberate-blinks')
      }
    } else if (this.stage === 'gaze') {
      if (!features) {
        this.features = []
        this.stepElapsed = 0
        return
      }
      this.features.push(features)
      if (this.features.length > 180) this.features.shift()
      if (this.stepElapsed >= 1500 && this.features.length >= this.config.minSamples) {
        this.gazeSamples.push({
          features: Array.from(
            { length: 6 },
            (_, i) => this.features.reduce((sum, f) => sum + f[i]!, 0) / this.features.length
          ),
          target: GAZE_DOTS[this.index]!
        })
        this.index++
        this.features = []
        this.stepElapsed = 0
        if (this.index === 9) {
          try {
            this.mapping = fitRidge(this.gazeSamples, this.config.ridgeLambda)
            this.enter('deliberate-blinks')
          } catch (error) {
            this.message = error instanceof Error ? error.message : 'Gaze fit failed'
            this.index = 8
            this.gazeSamples = []
            this.features = []
            this.stepElapsed = 0
            this.enter('framing')
            this.message = 'Gaze fit failed. Retry calibration or switch gaze off.'
          }
        }
      }
    } else if (this.stage === 'deliberate-blinks' || this.stage === 'natural-blinks') {
      const score = Math.min(left, right)
      if (score >= 0.6) {
        this.closedSince ??= t
        if (this.closedScores.length < 2000) this.closedScores.push(score)
      } else if (score <= 0.3) {
        if (this.openScores.length < 2000) this.openScores.push(score)
        if (this.closedSince !== undefined) {
          const duration = t - this.closedSince
          this.closedSince = undefined
          if (
            this.stage === 'deliberate-blinks' &&
            duration >= this.config.longBlinkMs &&
            duration <= 3000
          ) {
            this.deliberate.push(duration)
            this.index = this.deliberate.length
            if (this.index === 3) {
              this.natural = []
              this.enter('natural-blinks')
            }
          } else if (this.stage === 'natural-blinks' && duration > 0 && duration <= 3000)
            this.natural.push(duration)
        }
      }
      if (
        this.stage === 'natural-blinks' &&
        this.stepElapsed >= 10000 &&
        this.closedSince === undefined
      ) {
        const naturalMax = Math.max(0, ...this.natural),
          shortest = Math.min(...this.deliberate)
        if (naturalMax >= shortest * 0.8) {
          this.message =
            'Natural and deliberate blinks overlap. Retry with longer deliberate blinks.'
          this.stepElapsed = 0
          this.natural = []
          return
        }
        const closed = Math.max(0.35, Math.min(0.9, quantile(this.closedScores, 0.1) * 0.8))
        const open = Math.min(closed - 0.15, Math.max(0.1, quantile(this.openScores, 0.9) + 0.05))
        this.blink = {
          closedScore: closed,
          openScore: open,
          minLongBlinkMs: Math.max(400, (naturalMax + shortest) / 2),
          naturalMaxMs: naturalMax,
          deliberateMs: [...this.deliberate],
          naturalObservationMs: 10000
        }
        this.enter('quick-test')
      }
    }
  }
  observePoint(point: Point, t: number): void {
    if (
      this.stage !== 'quick-test' ||
      this.paused ||
      this.lastFrame === undefined ||
      t - this.lastFrame > 250
    ) {
      this.dwellSince = undefined
      this.dwellProgress = 0
      return
    }
    const target = this.target!
    const inside =
      Math.hypot(
        (point.x - target.x) * this.display.width,
        (point.y - target.y) * this.display.height
      ) <=
      this.config.targetSizePx / 2
    if (!inside) {
      this.dwellSince = undefined
      this.dwellProgress = 0
      return
    }
    this.dwellSince ??= t
    this.dwellProgress = Math.min(1, (t - this.dwellSince) / this.config.dwellMs)
    if (this.dwellProgress === 1) {
      this.index++
      this.dwellSince = undefined
      this.dwellProgress = 0
      if (this.index === 5) this.enter('review')
    }
  }
  profile(t: number): CalibrationProfile {
    if (this.stage !== 'review' && this.stage !== 'complete')
      throw new Error('Complete all five targets before saving')
    this.tick(t)
    return CalibrationProfileSchema.parse({
      version: 1,
      createdAt: t,
      durationMs: this.elapsedMs,
      neutral: this.neutral,
      range: this.range,
      pointer: { ...DEFAULT_POINTER_CONFIG, gazeEnabled: this.gazeEnabled },
      gaze: { enabled: this.gazeEnabled, mapping: this.mapping },
      blink: { ...this.blink, ...(this.ear ? { ear: this.ear } : {}) },
      display: this.display,
      quickTestHits: 5
    })
  }
  complete(): void {
    if (this.stage === 'review') this.enter('complete')
  }
}
