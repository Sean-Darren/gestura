import type { FaceFrame, VisionMetrics } from '@gestura/core'
export class FaceMetrics {
  private frames: { t: number; ms: number }[] = []
  add(frame: FaceFrame): VisionMetrics {
    this.frames.push({ t: frame.tCapture, ms: frame.tInferDone - frame.tCapture })
    this.frames = this.frames.filter((sample) => sample.t >= frame.tCapture - 2000).slice(-240)
    const samples = this.frames.map((sample) => sample.ms).sort((a, b) => a - b)
    const duration = frame.tCapture - (this.frames[0]?.t ?? frame.tCapture)
    return {
      fps: duration > 0 ? ((this.frames.length - 1) * 1000) / duration : 0,
      inferenceP50Ms: samples[Math.max(0, Math.ceil(samples.length * 0.5) - 1)] ?? 0,
      inferenceP95Ms: samples[Math.max(0, Math.ceil(samples.length * 0.95) - 1)] ?? 0,
      faceDetected: frame.faceDetected,
      eyeBlinkLeft: frame.blendshapes.eyeBlinkLeft ?? 0,
      eyeBlinkRight: frame.blendshapes.eyeBlinkRight ?? 0,
      jawOpen: frame.blendshapes.jawOpen ?? 0
    }
  }
  reset(): void {
    this.frames = []
  }
}
