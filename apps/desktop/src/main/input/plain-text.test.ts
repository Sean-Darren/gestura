import { expect, it, vi } from 'vitest'
import { MockProvider, PlainTextRouter } from '@gestura/genai'
import { MockNativeInput } from '@gestura/native/mock'
import { PaletteStateSchema, DEFAULT_PALETTE_CONFIG } from '@gestura/core'
import { InputController } from './controller'
import { createNativeInput } from '../native'
import { PauseController } from '../pause'

it('offers gaze-only rewriting, register switching and reviewed confirmation without mic input', async () => {
  const native = new MockNativeInput(),
    pause = new PauseController()
  native.focusedText = { token: crypto.randomUUID(), selectedText: '我唔得閒' }
  const request = {
    operation: 'rewrite',
    instruction: '',
    selectedText: '我唔得閒',
    register: 'standard_written'
  }
  const response = {
    status: 'ok',
    text: '本人未能出席。',
    register: 'standard_written',
    explanation: '正式用語'
  }
  const provider = new MockProvider({
    responses: {
      [JSON.stringify(request)]: response,
      [JSON.stringify({ ...request, register: 'colloquial_cantonese' })]: {
        ...response,
        text: '我嚟唔到呀',
        register: 'colloquial_cantonese'
      }
    }
  })
  let now = 1000
  const listening = vi.fn()
  const input = new InputController({
    pause,
    bridge: createNativeInput(pause, () => native),
    settings: { ...DEFAULT_PALETTE_CONFIG, gazeOnly: true },
    now: () => now,
    foreground: async () => ({ appId: 'TextEdit', windowTitle: 'test' }),
    display: () => ({ width: 375, height: 812 }),
    plainTextRouter: new PlainTextRouter(provider),
    publish: vi.fn(),
    listening,
    gazeOnly: vi.fn(),
    dragging: vi.fn(),
    pointerClick: vi.fn(),
    clipboard: async () => '',
    save: async () => {}
  })
  await input.control({ operation: 'activate', id: 'palette' })
  for (
    let page = 0;
    !input.state.tiles.some((t) => t.id === 'intent:rewrite-formally') && page < 20;
    page++
  )
    await input.control({ operation: 'activate', id: 'next' })
  await input.control({ operation: 'activate', id: 'intent:rewrite-formally' })
  await input.settle()
  expect(input.state.formula?.targetKind).toBe('plain-text')
  const toggle = input.state.tiles.find((t) => t.id === 'text:register')!
  expect(toggle.bounds.height).toBeGreaterThanOrEqual(64)
  expect(PaletteStateSchema.safeParse(input.state).success).toBe(true)
  const body = input.state.formula!.bounds!
  for (const tile of input.state.tiles.filter(
    (t) => t.id.startsWith('formula:') || t.id === 'text:register'
  )) {
    expect(tile.bounds.y).toBeGreaterThanOrEqual(body.y)
    expect(tile.bounds.y + tile.bounds.height).toBeLessThanOrEqual(body.y + body.height)
  }
  await input.control({ operation: 'activate', id: 'text:register' })
  await input.settle()
  expect(input.state.formula?.register).toBe('colloquial_cantonese')
  expect(native.calls.filter((c) => c.method === 'typeText')).toHaveLength(0)
  while (input.state.formula!.reviewPage < input.state.formula!.reviewPages - 1)
    await input.control({ operation: 'activate', id: 'formula:next' })
  await input.control({ operation: 'shown', id: input.state.formula!.proposalId! })
  const bounds = input.state.formula!.bounds!
  expect(input.click({ x: bounds.x + 20, y: bounds.y + 20 })).toBe(true)
  input.setSpeechState(false, 'silent')
  for (const jaw of [0, ...Array<number>(12).fill(1)]) {
    now += 100
    input.consume(
      {
        tCapture: now,
        tInferDone: now,
        faceDetected: true,
        landmarks: new Float32Array(1434),
        matrix: new Float32Array(16),
        blendshapes: { jawOpen: jaw }
      },
      true
    )
  }
  await input.settle()
  expect(native.calls.filter((c) => c.method === 'typeText')).toHaveLength(1)
  expect(listening).not.toHaveBeenCalledWith(true)
  input.dispose()
})
