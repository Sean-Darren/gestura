import type { EarBaseline, FaceFrame } from '@gestura/core'
export type EyeState = 'unknown' | 'open' | 'closed'
/** Relative EAR is calibrated at the same camera aspect ratio; it is not an absolute blink threshold. */
export function eyeAspectRatios(
  frame: FaceFrame,
  aspectRatio: number
): { left: number; right: number } | undefined {
  if (!frame.faceDetected || !Number.isFinite(aspectRatio) || aspectRatio <= 0) return undefined
  const distance = (a: number, b: number): number =>
    Math.hypot(
      (frame.landmarks[a * 3]! - frame.landmarks[b * 3]!) * aspectRatio,
      frame.landmarks[a * 3 + 1]! - frame.landmarks[b * 3 + 1]!
    )
  const ear = (p: readonly number[]): number =>
    (distance(p[1]!, p[5]!) + distance(p[2]!, p[4]!)) / (2 * distance(p[0]!, p[3]!))
  const left = ear([362, 385, 387, 263, 373, 380]),
    right = ear([33, 160, 158, 133, 153, 144])
  return Number.isFinite(left) && Number.isFinite(right) && left >= 0 && right >= 0
    ? { left, right }
    : undefined
}
export class EyeHysteresis {
  state: EyeState = 'unknown'
  reset(): void {
    this.state = 'unknown'
  }
  update(score: number | undefined, closed: number, open: number): EyeState {
    if (score === undefined || !Number.isFinite(score)) {
      this.reset()
      return this.state
    }
    if (score >= closed) this.state = 'closed'
    else if (score <= open) this.state = 'open'
    return this.state
  }
}
export function eyeScores(
  frame: FaceFrame,
  baseline: EarBaseline | undefined,
  aspectRatio: number,
  thresholds?: { closedScore: number; openScore: number }
): { left: number | undefined; right: number | undefined } {
  const ratios =
    baseline && Math.abs(baseline.aspectRatio - aspectRatio) < 0.01
      ? eyeAspectRatios(frame, aspectRatio)
      : undefined
  const fallback = (eye: 'left' | 'right'): number | undefined => {
    if (!baseline || !ratios) return undefined
    const ratio = ratios[eye] / baseline[eye]
    return ratio <= baseline.closedRatio ? 1 : ratio >= baseline.openRatio ? 0 : 0.5
  }
  const resolve = (eye: 'left' | 'right', score: number | undefined): number | undefined => {
    // Only resolve the hysteresis band. A strongly closed blendshape always wins.
    if (
      score !== undefined &&
      thresholds &&
      score > thresholds.openScore &&
      score < thresholds.closedScore &&
      fallback(eye) === 0
    )
      return thresholds.openScore
    return score ?? fallback(eye)
  }
  return {
    left: resolve('left', frame.blendshapes.eyeBlinkLeft),
    right: resolve('right', frame.blendshapes.eyeBlinkRight)
  }
}
