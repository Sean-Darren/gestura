import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { FaceLandmarkerOptions, FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import type { FaceFrame, VisionStatus } from '@gestura/core'
import { DEFAULT_VISION_CONFIG } from '@gestura/core/config'
import { FrameBus } from '@gestura/replay'
import type { FrameSource } from '@gestura/replay'
import { toFaceFrame } from './convert'

export const FACE_OPTIONS: FaceLandmarkerOptions = {
  baseOptions: { modelAssetPath: 'app://vision/face_landmarker.task', delegate: 'GPU' },
  runningMode: 'VIDEO',
  numFaces: 1,
  outputFaceBlendshapes: true,
  outputFacialTransformationMatrixes: true
}
export interface CameraDependencies {
  luminance?(video: HTMLVideoElement): number | undefined
  media(constraints: MediaStreamConstraints): Promise<MediaStream>
  landmarker(): Promise<{
    detectForVideo(video: HTMLVideoElement, timestamp: number): FaceLandmarkerResult
    close(): void
  }>
  video(): HTMLVideoElement
  now(): number
  schedule(callback: () => void, delay: number): () => void
}
let lightCanvas: HTMLCanvasElement | undefined
export const cameraDependencies: CameraDependencies = {
  luminance: (video) => {
    lightCanvas ??= document.createElement('canvas')
    lightCanvas.width = 16
    lightCanvas.height = 16
    const context = lightCanvas.getContext('2d', { willReadFrequently: true })
    if (!context) return undefined
    context.drawImage(video, 0, 0, 16, 16)
    const data = context.getImageData(0, 0, 16, 16).data
    let sum = 0
    for (let i = 0; i < data.length; i += 4)
      sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!
    context.clearRect(0, 0, 16, 16)
    return sum / (256 * 255)
  },
  media: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  landmarker: async () =>
    FaceLandmarker.createFromOptions(
      await FilesetResolver.forVisionTasks('app://vision/wasm'),
      FACE_OPTIONS
    ),
  video: () => {
    const video = document.createElement('video')
    video.autoplay = true
    video.muted = true
    video.playsInline = true
    return video
  },
  now: () => performance.timeOrigin + performance.now(),
  schedule: (callback, delay) => {
    const timer = setTimeout(callback, delay)
    return () => clearTimeout(timer)
  }
}
export class CameraSource implements FrameSource {
  private readonly bus = new FrameBus()
  private generation = 0
  private desired = false
  private paused = false
  private stream: MediaStream | undefined
  private video: HTMLVideoElement | undefined
  private model: Awaited<ReturnType<CameraDependencies['landmarker']>> | undefined
  private cancel: (() => void) | undefined
  private settings: MediaTrackSettings = {}
  constructor(
    private readonly status: (value: VisionStatus) => void,
    private readonly dependencies: CameraDependencies = cameraDependencies,
    private readonly diagnostics: (value: {
      tCapture: number
      luminance: number
    }) => void = () => {}
  ) {}
  subscribe(listener: (frame: FaceFrame) => void): () => void {
    return this.bus.subscribe(listener)
  }
  private report(state: VisionStatus['state'], message = ''): void {
    this.status({
      state,
      message: message.slice(0, 500),
      width: this.settings.width ?? 0,
      height: this.settings.height ?? 0,
      cameraFps: this.settings.frameRate ?? 0
    })
  }
  async start(): Promise<void> {
    this.release()
    this.desired = true
    if (this.paused) {
      this.report('paused')
      return
    }
    const generation = this.generation
    this.report('starting', 'Loading local model and requesting camera permission')
    let stream: MediaStream | undefined
    let model: Awaited<ReturnType<CameraDependencies['landmarker']>> | undefined
    let committed = false
    try {
      stream = await this.dependencies.media({
        audio: false,
        video: {
          width: { ideal: DEFAULT_VISION_CONFIG.width },
          height: { ideal: DEFAULT_VISION_CONFIG.height },
          frameRate: { ideal: DEFAULT_VISION_CONFIG.frameRate, min: 30 }
        }
      })
      if (generation !== this.generation) return
      model = await this.dependencies.landmarker()
      if (generation !== this.generation) return
      const video = this.dependencies.video()
      video.srcObject = stream
      await video.play()
      if (generation !== this.generation) {
        video.srcObject = null
        return
      }
      this.stream = stream
      this.model = model
      this.video = video
      this.settings = stream.getVideoTracks()[0]?.getSettings() ?? {}
      committed = true
      this.report('running', 'Camera tracking is local')
      let previousTime = -1
      let lastLight = -Infinity
      const tick = (): void => {
        if (generation !== this.generation || this.paused) return
        const tickStart = this.dependencies.now()
        try {
          if (video.readyState >= 2 && video.currentTime !== previousTime) {
            previousTime = video.currentTime
            const capture = this.dependencies.now()
            const result = model?.detectForVideo(video, capture)
            const inferDone = this.dependencies.now()
            if (capture - lastLight >= 500) {
              const luminance = this.dependencies.luminance?.(video)
              if (luminance !== undefined) this.diagnostics({ tCapture: capture, luminance })
              lastLight = capture
            }
            if (result) this.bus.emit(toFaceFrame(result, capture, inferDone))
          }
          this.cancel = this.dependencies.schedule(
            tick,
            Math.max(
              0,
              1000 / DEFAULT_VISION_CONFIG.frameRate - (this.dependencies.now() - tickStart)
            )
          )
        } catch (error) {
          this.stop()
          this.report('error', error instanceof Error ? error.message : 'Face inference failed')
        }
      }
      tick()
    } catch (error) {
      if (generation === this.generation) {
        this.desired = false
        this.report(
          'error',
          `${error instanceof Error ? error.message : 'Camera initialization failed'}. Check camera permission, GPU support, and pnpm models:fetch.`
        )
      }
    } finally {
      if (!committed) {
        stream?.getTracks().forEach((track) => track.stop())
        model?.close()
      }
    }
  }
  stop(): void {
    this.desired = false
    this.release()
    this.report('stopped')
  }
  setPaused(paused: boolean): void {
    if (paused === this.paused) return
    this.paused = paused
    if (paused) {
      this.release()
      this.report(this.desired ? 'paused' : 'stopped')
    } else if (this.desired) void this.start()
  }
  private release(): void {
    this.generation++
    this.cancel?.()
    this.cancel = undefined
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = undefined
    this.model?.close()
    this.model = undefined
    if (this.video) this.video.srcObject = null
    this.video = undefined
    this.settings = {}
  }
}
