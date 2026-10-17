import { describe, expect, it, vi } from 'vitest'
import { PaletteConfigSchema } from '@gestura/core'
import type { FaceFrame } from '@gestura/core'
import type { FormulaRouter } from '@gestura/genai'
import { MockNativeInput } from '@gestura/native/mock'
import { createNativeInput } from '../native'
import { PauseController } from '../pause'
import type { ExcelBridge } from '../excel-bridge'
import { InputController } from './controller'
function setup(): {
  input: InputController
  write: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
  generate: ReturnType<typeof vi.fn>
  say(text: string): Promise<void>
  shown(): Promise<void>
  frame(jaw: number, activity?: 'silent' | 'speaking'): void
} {
  let now = 1000
  const pause = new PauseController(),
    write = vi.fn(async () => true),
    restore = vi.fn(async () => true)
  const generate = vi.fn(async () => ({
    status: 'ok',
    formula: '=SUM(A2:A10)',
    targetCell: 'C2',
    references: ['A2', 'A10'],
    functionsUsed: ['SUM'],
    explanation: 'Adds column A.'
  }))
  const input = new InputController({
    pause,
    bridge: createNativeInput(pause, () => new MockNativeInput()),
    settings: PaletteConfigSchema.parse({}),
    now: () => now,
    foreground: async () => ({ appId: 'com.microsoft.Excel', windowTitle: 'Book1' }),
    display: () => ({ width: 1280, height: 800 }),
    publish: vi.fn(),
    listening: vi.fn(),
    gazeOnly: vi.fn(),
    dragging: vi.fn(),
    pointerClick: vi.fn(),
    clipboard: async () => '',
    save: async () => {},
    formulaRouter: { generate } as unknown as FormulaRouter,
    excelBridge: {
      getContext: async () => ({
        sheetName: 'Sheet1',
        sheetId: 's1',
        sessionId: 'b2c2d3e4-1234-4234-8234-123456789abc',
        activeCell: 'C2',
        selectionAddress: 'C2',
        usedRangeAddress: 'A1:C10',
        headers: [],
        columnTypes: {}
      }),
      prepareFormula: async () => ({
        token: crypto.randomUUID(),
        sessionId: 'b2c2d3e4-1234-4234-8234-123456789abc',
        sheetId: 's1',
        target: 'C2',
        before: { formula: null, value: 'old' }
      }),
      highlight: async () => true,
      writeFormula: write,
      restoreCell: restore
    } as unknown as ExcelBridge
  })
  input.setSpeechState(true, 'silent')
  return {
    input,
    write,
    restore,
    generate,
    say: async (text) => {
      const start = now + 1
      now += 20
      await input.transcript({
        text,
        lang: 'en',
        tSpeechStart: start,
        tSpeechEnd: now - 1,
        tDone: now
      })
      await input.settle()
    },
    shown: async () => {
      while (input.state.formula!.reviewPage < input.state.formula!.reviewPages - 1)
        await input.control({ operation: 'activate', id: 'formula:next' })
      await input.control({ operation: 'shown', id: input.state.formula!.proposalId! })
      now++
    },
    frame: (jaw, activity = 'silent') => {
      now += 100
      input.setSpeechState(true, activity)
      input.consume(
        {
          tCapture: now,
          tInferDone: now,
          faceDetected: true,
          landmarks: new Float32Array(1434),
          matrix: new Float32Array(16),
          blendshapes: { jawOpen: jaw }
        } satisfies FaceFrame,
        true
      )
    }
  }
}
describe('formula input wiring', () => {
  it('routes trusted speech correction, confirmation and undo to the formula loop', async () => {
    const f = setup()
    await f.say('formula sum prices')
    await f.shown()
    const old = f.input.state.formula!.proposalId
    await f.say('no, use column B')
    expect(f.input.state.formula).toMatchObject({ phase: 'proposed', correction: 1 })
    expect(f.input.state.formula!.proposalId).not.toBe(old)
    await f.say('confirm')
    expect(f.write).not.toHaveBeenCalled()
    await f.shown()
    await f.say('confirm')
    expect(f.write).toHaveBeenCalledOnce()
    await f.shown()
    await f.say('undo that')
    expect(f.restore).toHaveBeenCalledOnce()
    f.input.dispose()
  })
  it('requires a fresh silent one-second mouth hold after presentation; talking cannot confirm', async () => {
    const f = setup()
    await f.say('formula sum prices')
    await f.shown()
    for (let i = 0; i < 15; i++) f.frame(1, 'speaking')
    await f.input.settle()
    expect(f.write).not.toHaveBeenCalled()
    f.frame(0)
    for (let i = 0; i < 12; i++) f.frame(1)
    await f.input.settle()
    expect(f.write).toHaveBeenCalledOnce()
    f.input.dispose()
  })
  it('the gaze Undo control only opens a new confirmation card', async () => {
    const f = setup()
    await f.say('formula sum prices')
    await f.shown()
    await f.say('confirm')
    await f.input.control({ operation: 'activate', id: 'formula:undo' })
    expect(f.input.state.formula!.phase).toBe('undo-proposed')
    expect(f.restore).not.toHaveBeenCalled()
    await f.shown()
    await f.say('confirm')
    expect(f.restore).toHaveBeenCalledOnce()
    f.input.dispose()
  })
  it('blink/wink clicks on a card do nothing and explicit dwell Cancel cancels', async () => {
    const f = setup()
    await f.say('formula sum prices')
    await f.shown()
    const tile = f.input.state.tiles.find((t) => t.id === 'formula:cancel')!
    const point = { x: tile.bounds.x + 10, y: tile.bounds.y + 10 }
    expect(f.input.click(point)).toBe(true)
    expect(f.input.state.formula!.phase).toBe('proposed')
    await f.input.control({ operation: 'activate', id: 'formula:cancel' })
    expect(f.input.state.formula!.phase).toBe('cancelled')
    expect(f.write).not.toHaveBeenCalled()
    f.input.dispose()
  })
})
