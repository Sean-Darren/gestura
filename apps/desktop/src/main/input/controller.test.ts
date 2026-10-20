import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import {
  INTENT_IDS,
  PaletteStateSchema,
  PaletteConfigSchema,
  EXCEL_FUNCTIONS,
  PALETTE_KEYS,
  COMPOSER_CHARACTERS,
  createIpcEnvelope
} from '@gestura/core'
import type { FaceFrame, PaletteState, Intent } from '@gestura/core'
import { MockNativeInput } from '@gestura/native/mock'
import { FormulaRouter, MockProvider } from '@gestura/genai'
import { PauseController } from '../pause'
import { createNativeInput } from '../native'
import { InputController, NON_VOICE_PATHS } from './controller'
import { acceptsRendererChannel } from '../vision/ipc-policy'
import type { ExcelBridge } from '../excel-bridge'

type Options = ConstructorParameters<typeof InputController>[0]
type Harness = {
  controller: InputController
  options: Options & {
    foreground: Mock<Options['foreground']>
    clipboard: Mock<Options['clipboard']>
    listening: Mock<Options['listening']>
  }
  pause: PauseController
  mock: MockNativeInput
  activate(id: string): Promise<void>
  transcript(text: string, start?: number): Promise<void>
  shown(): Promise<void>
  frame(jaw: number, live?: boolean): void
  advance(ms: number): void
  now(): number
}
function setup(
  gazeOnly = false,
  width = 1440,
  height = 900,
  extras: {
    excelBridge?: Options['excelBridge']
    formulaRouter?: Options['formulaRouter']
    shareSamples?: boolean
  } = {}
): Harness {
  let t = 1000
  const pause = new PauseController(),
    mock = new MockNativeInput()
  const bridge = createNativeInput(pause, () => mock)
  const options = {
    pause,
    bridge,
    settings: PaletteConfigSchema.parse({
      gazeOnly,
      phrases: [{ id: 'hello', label: 'Greeting', text: 'Hello 你好 =SUM(A1:A3)' }]
    }),
    now: () => t,
    foreground: vi.fn(async () => ({ appId: 'com.example.editor', windowTitle: 'Draft' })),
    display: () => ({ width, height }),
    publish: vi.fn<(state: PaletteState) => void>(),
    listening: vi.fn(),
    gazeOnly: vi.fn(),
    dragging: vi.fn(),
    pointerClick: vi.fn(),
    clipboard: vi.fn(async () => 'Clipboard 你好'),
    save: vi.fn(async () => {}),
    ...(extras.excelBridge ? { excelBridge: extras.excelBridge } : {}),
    ...(extras.formulaRouter ? { formulaRouter: extras.formulaRouter } : {}),
    ...(extras.shareSamples !== undefined ? { shareSamples: extras.shareSamples } : {})
  }
  const controller = new InputController(options)
  const activate = async (id: string): Promise<void> => {
    if (
      !['palette', 'listen', 'gaze-only', 'cancel', 'review:next', 'review:previous'].includes(
        id
      ) &&
      !controller.state.open
    )
      await controller.control({ operation: 'activate', id: 'palette' })
    if (!controller.state.tiles.some((tile) => tile.id === id))
      while (controller.state.page > 0)
        await controller.control({ operation: 'activate', id: 'previous' })
    for (let i = 0; i < 30 && !controller.state.tiles.some((tile) => tile.id === id); i++)
      await controller.control({ operation: 'activate', id: 'next' })
    expect(
      controller.state.tiles.some((tile) => tile.id === id),
      `visible ${id}`
    ).toBe(true)
    await controller.control({ operation: 'activate', id })
  }
  const transcript = (text: string, start = t + 1): Promise<void> => {
    t += 10
    return controller.transcript({
      text,
      lang: 'en',
      tSpeechStart: start,
      tSpeechEnd: t - 1,
      tDone: t
    })
  }
  const shown = async (): Promise<void> => {
    while (controller.state.reviewPage < controller.state.reviewPages - 1)
      await activate('review:next')
    await controller.control({ operation: 'shown', id: controller.state.pending!.id })
  }
  const frame = (jaw: number, live = true): void => {
    t += 100
    controller.consume(
      {
        tCapture: t,
        tInferDone: t,
        faceDetected: true,
        landmarks: new Float32Array(1434),
        matrix: new Float32Array(16),
        blendshapes: { jawOpen: jaw }
      } satisfies FaceFrame,
      live
    )
  }
  return {
    controller,
    options,
    pause,
    mock,
    activate,
    transcript,
    shown,
    frame,
    advance: (ms: number) => {
      t += ms
    },
    now: () => t
  }
}
describe('dictation and gaze-only controller', () => {
  it('cancels text after display changes and pauses immediately if the presentation is lost', async () => {
    const s = setup(true)
    await s.activate('phrase:hello')
    await s.shown()
    s.controller.displayChanged()
    expect(s.controller.state.pending).toBeNull()
    await s.activate('phrase:hello')
    await s.shown()
    s.controller.presentationLost()
    expect(s.pause.paused).toBe(true)
    expect(s.controller.state.pending).toBeNull()
    expect(s.mock.calls).toEqual([])
    s.controller.dispose()
  })
  it('exercises every key, edit command, function starter and composer character through the visible action registry', async () => {
    const s = setup(true)
    for (const key of PALETTE_KEYS) await s.activate(`key:${key}`)
    await s.activate('copy')
    await s.activate('undo')
    expect(s.mock.calls.filter((c) => c.method === 'keyCombo')).toHaveLength(
      PALETTE_KEYS.length + 2
    )
    for (const name of EXCEL_FUNCTIONS) {
      await s.activate(`function:${name}`)
      const pending = s.controller.state.pending
      expect(pending && pending.kind !== 'formula' ? pending.text : '').toBe(`=${name}(`)
      await s.activate('cancel')
    }
    await s.activate('compose:phrase')
    for (let i = 0; i < COMPOSER_CHARACTERS.length; i++) await s.activate(`char:${i}`)
    expect(s.controller.state.draft).toBe(COMPOSER_CHARACTERS.join(''))
    await s.activate('compose:backspace')
    await s.activate('compose:clear')
    expect(s.controller.state.draft).toBe('')
    await s.activate('compose:close')
    await s.activate('edit:hello')
    await s.controller.control({ operation: 'draft', text: '改好嘅片語' })
    await s.activate('compose:done')
    expect(s.controller.state.settings.phrases.find((p) => p.id === 'hello')?.text).toBe(
      '改好嘅片語'
    )
    await s.activate('remove:hello')
    expect(s.controller.state.settings.phrases).toEqual([])
    expect(s.mock.calls.some((c) => c.method === 'typeText')).toBe(false)
    s.controller.dispose()
  })
  it('offers range/formula composers with honest unavailable integration messages and no native writes', async () => {
    const s = setup(true)
    for (const [purpose, text] of [
      ['range', 'A1:A10'],
      ['formula', 'sum this column']
    ] as const) {
      await s.activate(`compose:${purpose}`)
      await s.controller.control({ operation: 'draft', text })
      await s.activate('compose:done')
      expect(s.controller.state.message).toMatch(
        purpose === 'range' ? /Excel bridge not connected/ : /requires the Excel bridge/
      )
    }
    expect(s.mock.calls).toEqual([])
    s.controller.dispose()
  })
  it('publishes a valid formula proposal and writes only after the overlay acknowledges it', async () => {
    const writeFormula = vi.fn(async () => true)
    const excelBridge = {
      getContext: vi.fn(async () => ({
        sheetName: 'Sheet1',
        sheetId: 'sheet-1',
        sessionId: 'b2c2d3e4-1234-4234-8234-123456789abc',
        selectionAddress: 'B11',
        activeCell: 'B11',
        headers: ['Amount'],
        columnTypes: { A: 'text', B: 'number' },
        usedRangeAddress: 'A1:B11',
        samples: []
      })),
      writeFormula,
      prepareFormula: vi.fn(async () => ({
        token: 'a2c2d3e4-1234-4234-8234-123456789abc',
        sessionId: 'b2c2d3e4-1234-4234-8234-123456789abc',
        sheetId: 'sheet-1',
        target: 'B11',
        before: { formula: null, value: null }
      })),
      highlight: vi.fn(async () => true),
      restoreCell: vi.fn(async () => true),
      selectRange: vi.fn(() => true)
    } as unknown as ExcelBridge
    const formulaRouter = new FormulaRouter({
      local: new MockProvider({
        responses: {
          'sum column b': {
            status: 'ok',
            formula: '=SUM(B2:B10)',
            targetCell: 'B11',
            references: ['B2', 'B10'],
            functionsUsed: ['SUM'],
            explanation: 'Adds the values in B2:B10.'
          }
        }
      })
    })
    const s = setup(false, 1440, 900, { excelBridge, formulaRouter })
    s.controller.setSpeechState(true, 'silent')

    await s.activate('compose:formula')
    expect(s.controller.state.formulaListening).toBe(true)
    expect(
      s.controller.state.tiles.find((tile) => tile.id === 'cancel')?.bounds.y ?? 0
    ).toBeGreaterThanOrEqual(250)

    await s.transcript('sum column b')
    expect(s.controller.state.formulaListening).toBe(true)
    expect(s.controller.state.pending).toBeNull()
    expect(s.controller.state.draft).toContain('sum column b')

    s.frame(0)
    for (let i = 0; i < 11; i++) s.frame(0.8)
    await s.controller.settle()

    expect(() => createIpcEnvelope('palette:state', s.controller.state)).not.toThrow()
    expect(s.controller.state.formulaListening).toBe(false)
    expect(s.controller.state.formula?.phase).toBe('proposed')
    expect(s.controller.state.formula?.formula).toBe('=SUM(B2:B10)')
    expect(writeFormula).not.toHaveBeenCalled()

    while (s.controller.state.formula!.reviewPage < s.controller.state.formula!.reviewPages - 1)
      await s.controller.control({ operation: 'activate', id: 'formula:next' })
    await s.controller.control({ operation: 'shown', id: s.controller.state.formula!.proposalId! })
    await s.transcript('confirm')

    expect(writeFormula).toHaveBeenCalledTimes(1)
    expect(s.controller.state.pending).toBeNull()
    s.controller.dispose()
  })
  it('appends transcripts, revokes the old proposal and rejects confirmation before presentation or its onset', async () => {
    const s = setup()
    s.controller.setSpeechState(true, 'silent')
    await s.activate('intent:dictation-on')
    await s.transcript('Hello 你好')
    const old = s.controller.state.pending!.id
    await s.shown()
    const onset = s.now()
    await s.transcript('=SUM(A1:A3)')
    const pending = s.controller.state.pending!
    expect(pending.kind).toBe('dictation')
    if (pending.kind === 'dictation') {
      expect(pending.text).toBe('Hello 你好\n=SUM(A1:A3)')
      expect(pending.id).not.toBe(old)
    }
    await s.controller.control({ operation: 'shown', id: old })
    await s.transcript('confirm')
    expect(s.mock.calls).toEqual([])
    await s.shown()
    await s.transcript('confirm', onset)
    expect(s.mock.calls).toEqual([])
    await s.transcript('confirm')
    expect(
      s.mock.calls
        .filter((c) => c.method === 'typeText')
        .map((c) => c.args[0])
        .join('')
    ).toBe('Hello 你好\n=SUM(A1:A3)')
    expect(s.controller.state.pending).toBeNull()
    s.controller.dispose()
  })
  it('allows a fresh visible mouth hold, never a blink/dwell click, and does not toggle listening when confirming', async () => {
    const s = setup(true)
    await s.activate('phrase:hello')
    await s.shown()
    const tile = s.controller.state.tiles.find((t) => t.id === 'cancel')!
    expect(s.controller.click({ x: 20, y: 100 })).toBe(true)
    s.frame(0.8)
    for (let i = 0; i < 12; i++) s.frame(0.8)
    await s.controller.settle()
    expect(s.mock.calls).toEqual([])
    s.frame(0)
    for (let i = 0; i < 11; i++) s.frame(0.8)
    await s.controller.settle()
    expect(s.mock.calls.some((c) => c.method === 'typeText')).toBe(true)
    expect(s.options.listening).not.toHaveBeenCalledWith(true)
    expect(tile.bounds.height).toBeGreaterThanOrEqual(64)
    s.controller.dispose()
  })
  it('rechecks destination and cancels on pause, expiry and stale replay; ignores arbitrary/hidden actions', async () => {
    const s = setup()
    s.controller.setSpeechState(true, 'silent')
    await s.activate('phrase:hello')
    await s.shown()
    s.options.foreground.mockResolvedValue({ appId: 'another', windowTitle: 'Another window' })
    await s.transcript('confirm')
    expect(s.controller.state.pending).toBeNull()
    expect(s.mock.calls).toEqual([])
    await s.controller.control({ operation: 'activate', id: 'key:enter' })
    expect(s.mock.calls).toEqual([])
    await s.activate('phrase:hello')
    await s.shown()
    s.pause.toggle()
    expect(s.controller.state.pending).toBeNull()
    s.pause.toggle()
    await s.activate('phrase:hello')
    s.advance(60000)
    s.controller.tick({ x: 1000, y: 800 })
    expect(s.controller.state.pending).toBeNull()
    s.controller.dispose()
  })
  it('microphone-off jaw hold starts listening, talking/live unknown and replay cannot start or confirm', async () => {
    const s = setup()
    s.frame(0)
    for (let i = 0; i < 9; i++) s.frame(0.8)
    expect(s.options.listening).toHaveBeenCalledWith(true)
    s.options.listening.mockClear()
    s.controller.setSpeechState(true, 'speaking')
    s.frame(0)
    for (let i = 0; i < 15; i++) s.frame(0.8)
    expect(s.options.listening).not.toHaveBeenCalled()
    s.controller.setSpeechState(false)
    s.frame(0, false)
    for (let i = 0; i < 15; i++) s.frame(0.8, false)
    expect(s.options.listening).not.toHaveBeenCalled()
    s.controller.dispose()
    const g = setup(true)
    g.frame(0)
    for (let i = 0; i < 15; i++) g.frame(0.8)
    expect(g.options.listening).not.toHaveBeenCalledWith(true)
    g.controller.dispose()
  })
  it('paste is an exact reviewed snapshot, undo is single-use, and intervening actions invalidate it', async () => {
    const s = setup()
    s.controller.setSpeechState(true, 'silent')
    await s.activate('paste')
    expect(s.mock.calls).toEqual([])
    await s.shown()
    s.options.clipboard.mockResolvedValue('changed')
    await s.transcript('confirm')
    expect(
      s.mock.calls
        .filter((c) => c.method === 'typeText')
        .map((c) => c.args[0])
        .join('')
    ).toBe('Clipboard 你好')
    await s.transcript('undo that')
    await s.transcript('undo that')
    expect(s.mock.calls.filter((c) => c.method === 'keyCombo')).toHaveLength(1)
    await s.activate('paste')
    await s.shown()
    await s.transcript('confirm')
    s.controller.invalidateUndo()
    await s.transcript('undo that')
    expect(s.mock.calls.filter((c) => c.method === 'keyCombo')).toHaveLength(1)
    s.controller.dispose()
  })
  it('has an enabled non-voice path for every catalogue intent and >=64px tiles at narrow and normal sizes', async () => {
    const missing = INTENT_IDS.filter((id) => !NON_VOICE_PATHS[id])
    expect(missing, `Intents without non-voice paths: ${missing.join(', ')}`).toEqual([])
    for (const width of [320, 1440]) {
      const s = setup(true, width, 640)
      await s.activate('palette')
      const ids = new Set<string>()
      for (let i = 0; i < s.controller.state.pages; i++) {
        expect(PaletteStateSchema.safeParse(s.controller.state).success).toBe(true)
        for (const tile of s.controller.state.tiles) {
          ids.add(tile.id)
          expect(tile.bounds.width).toBeGreaterThanOrEqual(64)
          expect(tile.bounds.height).toBeGreaterThanOrEqual(64)
          expect(tile.bounds.x + tile.bounds.width).toBeLessThanOrEqual(width)
          expect(tile.bounds.y + tile.bounds.height).toBeLessThanOrEqual(640)
        }
        await s.controller.control({ operation: 'activate', id: 'next' })
      }
      for (const id of INTENT_IDS) {
        const path = NON_VOICE_PATHS[id]
        if (!['mouth-hold', 'pause-corner', 'cancel'].includes(path))
          expect(ids.has(path), id).toBe(true)
      }
      s.controller.dispose()
    }
  })
  it('dwell and blink selections are consumed once without underlying clicks, and editing works through character tiles', async () => {
    const s = setup(true)
    const palette = s.controller.state.tiles.find((tile) => tile.id === 'palette')!
    const point = { x: palette.bounds.x + 20, y: 30 }
    for (let i = 0; i < 12; i++) {
      s.advance(100)
      s.controller.point(point, s.now())
    }
    await s.controller.settle()
    expect(s.controller.state.open).toBe(true)
    expect(s.controller.click(point)).toBe(true)
    await s.controller.settle()
    expect(s.controller.state.open).toBe(true)
    await s.activate('compose:phrase')
    await s.activate('char:0')
    await s.activate('compose:done')
    expect(s.controller.state.settings.phrases.some((p) => p.text === 'A')).toBe(true)
    expect(s.options.save).toHaveBeenCalled()
    expect(s.mock.calls).toEqual([])
    s.controller.dispose()
  })
  it('arms a palette double-click for the next external target and routes voice and non-voice commands alike', async () => {
    const s = setup(true)
    await s.activate('intent:double-click')
    expect(s.options.pointerClick).not.toHaveBeenCalled()
    expect(s.controller.click({ x: 1000, y: 800 })).toBe(true)
    expect(s.options.pointerClick).toHaveBeenCalledWith('double-click')
    await s.controller.dispatch({ id: 'drag-off', slots: {} } satisfies Intent)
    expect(s.options.dragging).toHaveBeenCalledWith(false)
    s.controller.dispose()
  })
  it('restricts IPC roles and never exposes a confirmation-evidence channel', () => {
    for (const role of ['vision', 'speech'] as const)
      expect(acceptsRendererChannel(role, 'palette:control')).toBe(false)
    expect(acceptsRendererChannel('overlay', 'palette:control')).toBe(true)
    expect(acceptsRendererChannel('control', 'palette:state')).toBe(false)
  })
})
