import { describe, expect, it, vi } from 'vitest'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import type { VisionStatus } from '@gestura/core'
import { CameraSource, FACE_OPTIONS } from './camera'
import type { CameraDependencies } from './camera'
import { toFaceFrame } from './convert'

const empty: FaceLandmarkerResult = {
  faceLandmarks: [],
  faceBlendshapes: [],
  facialTransformationMatrixes: []
}
function fake(): {
  deps: CameraDependencies
  stop: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  video: HTMLVideoElement
  statuses: VisionStatus[]
  tick: () => void
  delays: number[]
} {
  const stop = vi.fn(),
    close = vi.fn(),
    statuses: VisionStatus[] = []
  const delays: number[] = []
  let callback: (() => void) | undefined
  const video = {
    currentTime: 1,
    readyState: 2,
    play: vi.fn().mockResolvedValue(undefined),
    srcObject: null
  } as unknown as HTMLVideoElement
  const stream = {
    getTracks: () => [{ stop }],
    getVideoTracks: () => [{ getSettings: () => ({ width: 1280, height: 720, frameRate: 60 }) }]
  } as unknown as MediaStream
  const deps: CameraDependencies = {
    media: vi.fn().mockResolvedValue(stream),
    landmarker: vi.fn().mockResolvedValue({ detectForVideo: () => empty, close }),
    video: () => video,
    now: () => 100,
    schedule: (cb, delay) => {
      delays.push(delay)
      callback = cb
      return () => {
        callback = undefined
      }
    }
  }
  return { deps, stop, close, video, statuses, delays, tick: () => callback?.() }
}
describe('local face capture', () => {
  it('publishes scalar lighting summaries locally and never pixels', async () => {
    const f = fake(),
      diagnostics = vi.fn()
    f.deps.luminance = () => 0.5
    const source = new CameraSource(() => {}, f.deps, diagnostics)
    await source.start()
    expect(diagnostics).toHaveBeenCalledWith({ tCapture: 100, luminance: 0.5 })
    f.video.currentTime = 2
    f.tick()
    expect(diagnostics).toHaveBeenCalledOnce()
    source.stop()
  })

  it('uses current GPU/VIDEO options and requested camera constraints, emitting features only', async () => {
    expect(FACE_OPTIONS).toMatchObject({
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      baseOptions: { delegate: 'GPU', modelAssetPath: 'app://vision/face_landmarker.task' }
    })
    const fakeCamera = fake(),
      listener = vi.fn()
    const source = new CameraSource((status) => fakeCamera.statuses.push(status), fakeCamera.deps)
    source.subscribe(listener)
    await source.start()
    expect(fakeCamera.deps.media).toHaveBeenCalledWith({
      audio: false,
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, min: 30 } }
    })
    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0]?.[0].landmarks).toBeInstanceOf(Float32Array)
    fakeCamera.tick()
    expect(listener).toHaveBeenCalledOnce()
    fakeCamera.video.currentTime = 2
    fakeCamera.tick()
    expect(listener).toHaveBeenCalledTimes(2)
    source.stop()
    expect(fakeCamera.stop).toHaveBeenCalledOnce()
    expect(fakeCamera.close).toHaveBeenCalledOnce()
  })
  it('keeps only reduced-rate local inference on pause; Stop releases camera and model', async () => {
    const f = fake(),
      listener = vi.fn()
    const source = new CameraSource((status) => f.statuses.push(status), f.deps)
    source.subscribe(listener)
    await source.start()
    source.setPaused(true)
    f.video.currentTime = 2
    f.tick()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(f.delays.at(-1)).toBe(200)
    expect(f.stop).not.toHaveBeenCalled()
    expect(f.statuses.at(-1)?.state).toBe('paused')
    source.setPaused(false)
    f.video.currentTime = 3
    f.tick()
    expect(f.delays.at(-1)).toBeLessThan(34)
    expect(f.deps.media).toHaveBeenCalledOnce()
    source.stop()
    source.setPaused(true)
    source.setPaused(false)
    expect(f.stop).toHaveBeenCalledOnce()
    expect(f.close).toHaveBeenCalledOnce()
    expect(f.deps.media).toHaveBeenCalledOnce()
  })
  it('cleans up an asynchronous stream acquired after stop', async () => {
    const f = fake()
    let finish: ((value: MediaStream) => void) | undefined
    f.deps.media = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    const source = new CameraSource(() => {}, f.deps)
    const pending = source.start()
    source.stop()
    finish?.({ getTracks: () => [{ stop: f.stop }] } as unknown as MediaStream)
    await pending
    expect(f.stop).toHaveBeenCalledOnce()
    expect(f.deps.landmarker).not.toHaveBeenCalled()
  })
  it('reports initialization failures and releases media', async () => {
    const f = fake()
    f.deps.landmarker = async () => {
      throw new Error('GPU unavailable')
    }
    const source = new CameraSource((status) => f.statuses.push(status), f.deps)
    await source.start()
    expect(f.statuses.at(-1)?.state).toBe('error')
    expect(f.statuses.at(-1)?.message).toContain('GPU unavailable')
    expect(f.stop).toHaveBeenCalledOnce()
  })
  it('converts exact 478-landmark results, clears no-face frames, and rejects malformed results', () => {
    const result: FaceLandmarkerResult = {
      faceLandmarks: [
        Array.from({ length: 478 }, () => ({ x: 0.2, y: 0.3, z: 0.1, visibility: 1 }))
      ],
      faceBlendshapes: [
        {
          headIndex: 0,
          headName: '',
          categories: [{ index: 0, categoryName: '_neutral', displayName: '', score: 0.6 }]
        }
      ],
      facialTransformationMatrixes: [
        { rows: 4, columns: 4, data: Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0)) }
      ]
    }
    expect(toFaceFrame(result, 100, 105).blendshapes._neutral).toBe(0.6)
    const noFace = toFaceFrame(empty, 110, 115)
    expect(noFace.faceDetected).toBe(false)
    expect(noFace.landmarks.every((n) => n === 0)).toBe(true)
    expect(noFace.blendshapes).toEqual({})
    expect(() => toFaceFrame({ ...result, faceLandmarks: [[]] }, 100, 105)).toThrow('landmark')
    expect(() => toFaceFrame({ ...result, facialTransformationMatrixes: [] }, 100, 105)).toThrow(
      'matrix'
    )
  })
})
