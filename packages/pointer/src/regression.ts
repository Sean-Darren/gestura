import { GazeMappingSchema } from '@gestura/core'
import type { FaceFrame, GazeMapping, Pose } from '@gestura/core'
import type { Point } from './pose'
export interface GazeSample {
  features: number[]
  target: Point
}
export function irisFeatures(frame: FaceFrame, pose: Pose): number[] | undefined {
  if (
    !frame.faceDetected ||
    (frame.blendshapes.eyeBlinkLeft ?? 0) > 0.5 ||
    (frame.blendshapes.eyeBlinkRight ?? 0) > 0.5
  )
    return undefined
  const features: number[] = []
  for (const [iris, a, b, top, bottom] of [
    [468, 33, 133, 159, 145],
    [473, 362, 263, 386, 374]
  ]) {
    const at = (i: number, axis: number): number => frame.landmarks[i * 3 + axis]!
    const ax = at(a!, 0),
      ay = at(a!, 1),
      bx = at(b!, 0),
      by = at(b!, 1),
      vx = bx - ax,
      vy = by - ay
    const width = Math.hypot(vx, vy),
      height = Math.hypot(at(top!, 0) - at(bottom!, 0), at(top!, 1) - at(bottom!, 1))
    if (width < 1e-5 || height < width * 0.05) return undefined
    const dx = at(iris!, 0) - (ax + bx) / 2,
      dy = at(iris!, 1) - (ay + by) / 2,
      sign = vx >= 0 ? 1 : -1
    features.push(
      (sign * (dx * vx + dy * vy)) / (width * width),
      (sign * (-dx * vy + dy * vx)) / (width * height)
    )
  }
  features.push(pose.yaw / 30, pose.pitch / 30)
  return features.every(Number.isFinite) ? features : undefined
}
function solve(matrix: number[][], rhs: number[]): number[] {
  const rows = matrix.map((row, i) => [...row, rhs[i]!])
  for (let col = 0; col < rhs.length; col++) {
    let pivot = col
    for (let row = col + 1; row < rows.length; row++)
      if (Math.abs(rows[row]![col]!) > Math.abs(rows[pivot]![col]!)) pivot = row
    ;[rows[col], rows[pivot]] = [rows[pivot]!, rows[col]!]
    const denominator = rows[col]![col]!
    if (Math.abs(denominator) < 1e-10) throw new Error('Calibration features are singular')
    for (let j = col; j <= rhs.length; j++) rows[col]![j] = rows[col]![j]! / denominator
    for (let row = 0; row < rows.length; row++)
      if (row !== col) {
        const factor = rows[row]![col]!
        for (let j = col; j <= rhs.length; j++)
          rows[row]![j] = rows[row]![j]! - factor * rows[col]![j]!
      }
  }
  return rows.map((row) => row.at(-1)!)
}
export function predictGaze(features: number[], mapping: GazeMapping): Point {
  if (features.length !== 6 || !features.every(Number.isFinite))
    throw new Error('Expected six finite iris/head features')
  const vector = [1, ...features.map((v, i) => (v - mapping.mean[i]!) / mapping.scale[i]!)]
  const dot = (weights: number[]): number => vector.reduce((sum, v, i) => sum + v * weights[i]!, 0)
  return { x: dot(mapping.x), y: dot(mapping.y) }
}
/** Fits a local calibration transform; no samples are retained in the returned profile. */
export function fitRidge(samples: GazeSample[], lambda = 0.001): GazeMapping {
  if (samples.length < 9 || samples.length > 10000 || !Number.isFinite(lambda) || lambda <= 0)
    throw new Error('Need nine calibration samples and a positive ridge penalty')
  for (const s of samples)
    if (
      s.features.length !== 6 ||
      !s.features.every(Number.isFinite) ||
      !Number.isFinite(s.target.x) ||
      !Number.isFinite(s.target.y)
    )
      throw new Error('Invalid calibration sample')
  const mean = Array.from(
    { length: 6 },
    (_, i) => samples.reduce((sum, s) => sum + s.features[i]!, 0) / samples.length
  )
  const scale = mean.map(
    (m, i) =>
      Math.sqrt(samples.reduce((sum, s) => sum + (s.features[i]! - m) ** 2, 0) / samples.length) ||
      1
  )
  const rows = samples.map((s) => [1, ...s.features.map((v, i) => (v - mean[i]!) / scale[i]!)])
  const gram = Array.from({ length: 7 }, (_, i) =>
    Array.from(
      { length: 7 },
      (_, j) =>
        rows.reduce((sum, row) => sum + row[i]! * row[j]!, 0) + (i === j && i > 0 ? lambda : 0)
    )
  )
  const weights = (axis: 'x' | 'y'): number[] =>
    solve(
      gram,
      Array.from({ length: 7 }, (_, i) =>
        rows.reduce((sum, row, j) => sum + row[i]! * samples[j]!.target[axis], 0)
      )
    )
  const mapping = {
    features: 'iris-offsets-head-v1' as const,
    mean,
    scale,
    x: weights('x'),
    y: weights('y'),
    rmse: 0,
    samples: samples.length
  }
  mapping.rmse = Math.sqrt(
    samples.reduce((sum, s) => {
      const p = predictGaze(s.features, mapping)
      return sum + (p.x - s.target.x) ** 2 + (p.y - s.target.y) ** 2
    }, 0) / samples.length
  )
  if (!Number.isFinite(mapping.rmse) || mapping.rmse > 0.2)
    throw new Error('Gaze fit is unreliable; retry or keep gaze off')
  return GazeMappingSchema.parse(mapping)
}
