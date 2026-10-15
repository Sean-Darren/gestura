import { describe, expect, it } from 'vitest'
import { acceptsRendererChannel } from './ipc-policy'
import { allowVisionCamera } from './permissions'
import { visionAssetName, readVisionAsset } from './assets'
import { FaceMetrics } from './metrics'
describe('vision boundary', () => {
  it('only accepts feature frames from vision and controls from control', () => {
    expect(acceptsRendererChannel('vision', 'vision:frame')).toBe(true)
    expect(acceptsRendererChannel('control', 'vision:frame')).toBe(false)
    expect(acceptsRendererChannel('overlay', 'vision:frame')).toBe(false)
    expect(acceptsRendererChannel('vision', 'replay:control')).toBe(false)
    expect(acceptsRendererChannel('control', 'vision:control')).toBe(true)
    expect(acceptsRendererChannel('control', 'vision:metrics')).toBe(false)
  })
  it('grants only the vision renderer video permission', () => {
    expect(allowVisionCamera(1, 1, 'media', ['video'])).toBe(true)
    for (const args of [
      [2, 1, 'media', ['video']],
      [1, 1, 'media', ['audio']],
      [1, 1, 'media', ['audio', 'video']],
      [1, 1, 'geolocation', ['video']],
      [undefined, undefined, 'media', ['video']]
    ] as const)
      expect(allowVisionCamera(args[0], args[1], args[2], args[3])).toBe(false)
  })
  it('serves only named local model/WASM paths and blocks traversal', async () => {
    expect(visionAssetName('app://vision/face_landmarker.task')).toBe('face_landmarker.task')
    expect(visionAssetName('app://vision/wasm/vision_wasm_internal.wasm')).toBe(
      'wasm/vision_wasm_internal.wasm'
    )
    for (const url of [
      'https://example.com/a',
      'app://other/face_landmarker.task',
      'app://vision/%2e%2e/package.json',
      'app://vision/wasm/x.js',
      'app://vision/face_landmarker.task?q=x'
    ])
      expect(visionAssetName(url)).toBeUndefined()
    expect((await readVisionAsset('/missing', 'app://vision/face_landmarker.task')).status).toBe(
      404
    )
  })
  it('computes exact rolling inference percentiles and processed fps', () => {
    const metrics = new FaceMetrics()
    let result
    for (let i = 0; i < 100; i++)
      result = metrics.add({
        tCapture: i * 10,
        tInferDone: i * 10 + i,
        faceDetected: true,
        landmarks: new Float32Array(1434),
        matrix: new Float32Array(16),
        blendshapes: { jawOpen: 0.5 }
      })
    expect(result?.inferenceP50Ms).toBe(49)
    expect(result?.inferenceP95Ms).toBe(94)
    expect(result?.fps).toBe(100)
    expect(result?.jawOpen).toBe(0.5)
    metrics.reset()
    expect(
      metrics.add({
        tCapture: 5000,
        tInferDone: 5005,
        faceDetected: false,
        landmarks: new Float32Array(1434),
        matrix: new Float32Array(16),
        blendshapes: {}
      }).fps
    ).toBe(0)
  })
})

it('accepts pointer enable messages only from control', () => {
  expect(acceptsRendererChannel('control', 'pointer:control')).toBe(true)
  expect(acceptsRendererChannel('vision', 'pointer:control')).toBe(false)
  expect(acceptsRendererChannel('overlay', 'pointer:control')).toBe(false)
  expect(acceptsRendererChannel('control', 'pointer:metrics')).toBe(false)
})

it('limits calibration commands to control and diagnostics to vision', () => {
  expect(acceptsRendererChannel('control', 'calibration:control')).toBe(true)
  expect(acceptsRendererChannel('vision', 'calibration:control')).toBe(false)
  expect(acceptsRendererChannel('vision', 'vision:diagnostics')).toBe(true)
  expect(acceptsRendererChannel('control', 'vision:diagnostics')).toBe(false)
  expect(acceptsRendererChannel('control', 'calibration:state')).toBe(false)
})

it('restricts gesture mode controls and permits pause from control or overlay only', () => {
  expect(acceptsRendererChannel('control', 'gestures:control')).toBe(true)
  expect(acceptsRendererChannel('overlay', 'gestures:control')).toBe(false)
  expect(acceptsRendererChannel('vision', 'gestures:control')).toBe(false)
  expect(acceptsRendererChannel('control', 'system:toggle-pause')).toBe(true)
  expect(acceptsRendererChannel('overlay', 'system:toggle-pause')).toBe(true)
  expect(acceptsRendererChannel('vision', 'system:toggle-pause')).toBe(false)
  expect(acceptsRendererChannel('control', 'gestures:state')).toBe(false)
})

it('accepts benchmark commands only from control and never renderer feedback', () => {
  expect(acceptsRendererChannel('control', 'bench:control')).toBe(true)
  expect(acceptsRendererChannel('vision', 'bench:control')).toBe(false)
  expect(acceptsRendererChannel('overlay', 'bench:control')).toBe(false)
  expect(acceptsRendererChannel('control', 'bench:state')).toBe(false)
})

it('accepts per-app snapping controls only from control', () => {
  expect(acceptsRendererChannel('control', 'snap:control')).toBe(true)
  expect(acceptsRendererChannel('overlay', 'snap:control')).toBe(false)
  expect(acceptsRendererChannel('vision', 'snap:control')).toBe(false)
  expect(acceptsRendererChannel('control', 'snap:settings')).toBe(false)
})
