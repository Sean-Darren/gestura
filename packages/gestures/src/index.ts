import type { CalibrationProfile, FaceFrame, GestureEvent } from '@gestura/core'
import { DEFAULT_GESTURE_CONFIG } from '@gestura/core/config'
import type { GestureConfig } from '@gestura/core/config'
import { EyeHysteresis, eyeScores } from './eyes'
export * from './eyes'
export * from './mouth-hold'
export const packageName = '@gestura/gestures'
export type Point = { x: number; y: number }
export type SpeechState = 'silent' | 'speaking' | 'unknown'
interface Closure {
  t: number
  point: Point
  left: number | undefined
  right: number | undefined
  firstOpen: number | undefined
  leftOpened: boolean
  rightOpened: boolean
  invalid: boolean
}
export interface GestureResult {
  events: GestureEvent[]
  frozen: boolean
  point: Point
  dwellProgress: number
  eyesOpen: boolean
}
export class GestureEngine {
  private readonly left = new EyeHysteresis()
  private readonly right = new EyeHysteresis()
  private armed = false
  private closure: Closure | undefined
  private lastT = -Infinity
  private lastAction = -Infinity
  private anchor: Point | undefined
  private dwellStart = 0
  private dwellLatched = false
  private lastJaw = 0
  private speechUntil = -Infinity
  private jawSince: number | undefined
  private jawReference = 0
  private jawLatched = false
  private dragging = false
  constructor(
    private readonly blink: CalibrationProfile['blink'],
    readonly config: GestureConfig = DEFAULT_GESTURE_CONFIG
  ) {}
  reset(point: Point = { x: 0, y: 0 }, t = 0): GestureEvent[] {
    const events: GestureEvent[] = this.dragging
      ? [{ kind: 'mouseUp', button: 'left', ...point, t }]
      : []
    this.left.reset()
    this.right.reset()
    this.armed = false
    this.closure = undefined
    this.lastT = -Infinity
    this.anchor = undefined
    this.dwellLatched = false
    this.lastAction = -Infinity
    this.jawSince = undefined
    this.jawLatched = false
    this.speechUntil = -Infinity
    this.lastJaw = 0
    this.dragging = false
    return events
  }
  setDragging(active: boolean, point: Point, t: number): GestureEvent[] {
    if (active === this.dragging) return []
    this.dragging = active
    return [{ kind: active ? 'mouseDown' : 'mouseUp', button: 'left', ...point, t }]
  }
  update(
    frame: FaceFrame,
    point: Point,
    speedPxS: number,
    aspectRatio = 16 / 9,
    speaking: SpeechState = 'unknown'
  ): GestureResult {
    const events: GestureEvent[] = [],
      t = frame.tCapture
    const empty = (frozen = false): GestureResult => ({
      events,
      frozen,
      point,
      dwellProgress: 0,
      eyesOpen: false
    })
    if (!Number.isFinite(t) || t < 0) {
      events.push(...this.reset(point, 0))
      return empty()
    }
    if (t <= this.lastT) return empty(!!this.closure)
    if (!frame.faceDetected || t - this.lastT > this.config.staleMs) {
      events.push(...this.reset(point, t))
      if (!frame.faceDetected) return empty()
    }
    this.lastT = t
    const jaw = frame.blendshapes.jawOpen ?? 0
    if (
      speaking === 'speaking' ||
      jaw > 0.25 ||
      (Math.abs(jaw - this.lastJaw) > 0.06 && Math.max(jaw, this.lastJaw) > 0.12)
    )
      this.speechUntil = t + 600
    this.lastJaw = jaw
    const quiet = speaking !== 'speaking' && t >= this.speechUntil
    if (jaw <= this.config.jawCloseScore) {
      this.jawSince = undefined
      this.jawLatched = false
    } else if (jaw >= this.config.jawOpenScore && speaking === 'silent') {
      if (this.jawSince === undefined || Math.abs(jaw - this.jawReference) > 0.1) {
        this.jawSince = t
        this.jawReference = jaw
      }
      if (t - this.jawSince >= this.config.jawHoldMs && !this.jawLatched) {
        events.push({ kind: 'toggleListening', t })
        this.jawLatched = true
      }
    } else this.jawSince = undefined
    const scores = eyeScores(frame, this.blink.ear, aspectRatio)
    // EAR fallback uses binary endpoints, mapped onto each profile's blendshape hysteresis.
    const fallback = (
      value: number | undefined,
      eye: 'eyeBlinkLeft' | 'eyeBlinkRight'
    ): number | undefined =>
      frame.blendshapes[eye] === undefined && value !== undefined
        ? value === 1
          ? this.blink.closedScore
          : value === 0
            ? this.blink.openScore
            : (this.blink.closedScore + this.blink.openScore) / 2
        : value
    const left = this.left.update(
      fallback(scores.left, 'eyeBlinkLeft'),
      this.blink.closedScore,
      this.blink.openScore
    )
    const right = this.right.update(
      fallback(scores.right, 'eyeBlinkRight'),
      this.blink.closedScore,
      this.blink.openScore
    )
    if (left === 'unknown' || right === 'unknown') {
      events.push(...this.reset(point, t))
      return empty()
    }
    const open = left === 'open' && right === 'open',
      safe = quiet && Number.isFinite(speedPxS) && speedPxS <= this.config.maxSpeedPxS
    let frozen = false,
      frozenPoint = point
    if (this.config.mode === 'blink') {
      if (!open && !this.armed && !this.closure)
        return { events, frozen: true, point, dwellProgress: 0, eyesOpen: false }
      if (!open && this.armed && !this.closure)
        this.closure = {
          t,
          point: { ...point },
          left: left === 'closed' ? t : undefined,
          right: right === 'closed' ? t : undefined,
          firstOpen: undefined,
          leftOpened: false,
          rightOpened: false,
          invalid: !safe
        }
      const c = this.closure
      if (c) {
        frozen = true
        frozenPoint = c.point
        if ((c.leftOpened && left === 'closed') || (c.rightOpened && right === 'closed'))
          c.invalid = true
        if (c.left !== undefined && left === 'open') c.leftOpened = true
        if (c.right !== undefined && right === 'open') c.rightOpened = true
        if (left === 'closed') c.left ??= t
        if (right === 'closed') c.right ??= t
        if (
          (c.left !== undefined && left === 'open') ||
          (c.right !== undefined && right === 'open')
        )
          c.firstOpen ??= t
        if (
          !safe ||
          (c.left !== undefined && c.right !== undefined && t - c.t > this.config.maxLongBlinkMs)
        )
          c.invalid = true
        if (open) {
          const ready =
            !this.dragging && !c.invalid && t - this.lastAction >= this.config.cooldownMs
          if (c.left !== undefined && c.right !== undefined) {
            const duration = (c.firstOpen ?? t) - Math.max(c.left, c.right)
            if (
              ready &&
              Math.abs(c.left - c.right) <= this.config.onsetSyncMs &&
              duration >= Math.max(400, this.blink.minLongBlinkMs) &&
              duration <= this.config.maxLongBlinkMs
            ) {
              events.push({ kind: 'click', button: 'left', source: 'long-blink', ...c.point, t })
              this.lastAction = t
            }
          } else {
            const duration = t - c.t,
              eye = c.left !== undefined ? 'left' : 'right'
            if (ready && duration >= this.config.winkMinMs) {
              events.push({ kind: 'wink', eye, t })
              if (eye === 'left') {
                events.push({ kind: 'click', button: 'right', source: 'left-wink', ...c.point, t })
                this.lastAction = t
              }
            }
          }
          this.closure = undefined
        }
      }
      if (open) this.armed = true
    }
    let dwellProgress = 0
    if (this.config.mode === 'dwell' && !this.dragging && open && safe) {
      if (
        !this.anchor ||
        Math.hypot(point.x - this.anchor.x, point.y - this.anchor.y) > this.config.dwellRadiusPx
      ) {
        this.anchor = { ...point }
        this.dwellStart = t
        this.dwellLatched = false
      }
      if (!this.dwellLatched) {
        dwellProgress = Math.min(1, (t - this.dwellStart) / this.config.dwellMs)
        if (dwellProgress === 1 && t - this.lastAction >= this.config.cooldownMs) {
          events.push({ kind: 'click', button: 'left', source: 'dwell', ...point, t })
          this.lastAction = t
          this.dwellLatched = true
          dwellProgress = 0
        }
      }
    } else {
      this.anchor = undefined
      this.dwellLatched = false
    }
    return { events, frozen, point: frozenPoint, dwellProgress, eyesOpen: open }
  }
}
/** A fixed target dwell that must be exited before rearming, including across pause toggles. */
export class CornerDwell {
  private since: number | undefined
  private latched = false
  private lastT = -Infinity
  update(inside: boolean, t: number, durationMs: number): { toggle: boolean; progress: number } {
    if (!Number.isFinite(t) || t < 0) {
      this.since = undefined
      return { toggle: false, progress: 0 }
    }
    if (t <= this.lastT) return { toggle: false, progress: 0 }
    if (t - this.lastT > 1000) this.since = undefined
    this.lastT = t
    if (!inside) {
      this.since = undefined
      this.latched = false
      return { toggle: false, progress: 0 }
    }
    if (this.latched) return { toggle: false, progress: 0 }
    this.since ??= t
    const progress = Math.min(1, (t - this.since) / durationMs)
    if (progress === 1) {
      this.latched = true
      return { toggle: true, progress: 0 }
    }
    return { toggle: false, progress }
  }
  latch(): void {
    this.latched = true
    this.since = undefined
  }
  interrupt(): void {
    this.since = undefined
  }
}
