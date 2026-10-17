import { describe, expect, it, vi } from 'vitest'
import type { ConfirmationEvidence, ExcelContext, ExcelSnapshot } from '@gestura/core'
import type { FormulaRequest, FormulaResponse } from '@gestura/genai'
import { ActionGate, isConfirmedAction } from '../action-gate'
import { PauseController } from '../pause'
import { FormulaController } from './controller'

const context: ExcelContext = {
  sheetName: 'Budget',
  sheetId: 'sheet-1',
  sessionId: 'b2c2d3e4-1234-4234-8234-123456789abc',
  selectionAddress: 'C2',
  activeCell: 'C2',
  headers: ['Price', 'Qty'],
  columnTypes: { A: 'number', B: 'number' },
  usedRangeAddress: 'A1:C10'
}
const snapshot: ExcelSnapshot = {
  token: 'a2c2d3e4-1234-4234-8234-123456789abc',
  sessionId: context.sessionId!,
  sheetId: 'sheet-1',
  target: 'C2',
  before: { formula: null, value: 'private original' }
}
const response: FormulaResponse = {
  status: 'ok',
  formula: '=SUM(A2:A10)',
  explanation: 'Adds the prices.',
  targetCell: 'C2',
  references: ['A2', 'A10'],
  functionsUsed: ['SUM']
}
function fixture(generate?: (r: FormulaRequest, s: AbortSignal) => Promise<FormulaResponse>): {
  controller: FormulaController
  gate: ActionGate
  pause: PauseController
  bridge: {
    getContext: ReturnType<typeof vi.fn>
    prepareFormula: ReturnType<typeof vi.fn>
    highlight: ReturnType<typeof vi.fn>
    writeFormula: ReturnType<typeof vi.fn>
    restoreCell: ReturnType<typeof vi.fn>
  }
  foreground: ReturnType<typeof vi.fn>
  advance(n: number): void
  present(): string
  voice(): ConfirmationEvidence
} {
  let time = 1000
  const gate = new ActionGate(
    () => time,
    () => time
  )
  const pause = new PauseController()
  const bridge = {
    getContext: vi.fn(async () => context),
    prepareFormula: vi.fn(async () => structuredClone(snapshot)),
    highlight: vi.fn(async () => true),
    writeFormula: vi.fn(async () => true),
    restoreCell: vi.fn(async () => true)
  }
  const foreground = vi.fn(async () => ({ appId: 'com.microsoft.Excel', windowTitle: 'Budget' }))
  const controller = new FormulaController({
    gate,
    bridge,
    pause,
    now: () => time,
    foreground,
    generate: generate ?? (async () => response),
    display: () => ({ width: 1440, height: 900 }),
    anchor: () => ({ x: 300, y: 200, width: 80, height: 24 }),
    publish: vi.fn(),
    shareSamples: false
  })
  return {
    controller,
    foreground,
    gate,
    pause,
    bridge,
    advance: (n) => {
      time += n
    },
    present: () => {
      controller.review(100000)
      const id = controller.state.proposalId!
      controller.present(id)
      time++
      return id
    },
    voice: () => ({ kind: 'voice-confirm', tSpeechStart: time })
  }
}
async function proposed(f: ReturnType<typeof fixture>): Promise<void> {
  f.controller.start('sum prices')
  await f.controller.settle()
  expect(f.controller.state.phase).toBe('proposed')
}
describe('formula confirmation loop', () => {
  it('shows a bound proposal and highlights columns without writing', async () => {
    const f = fixture()
    await proposed(f)
    expect(f.bridge.writeFormula).not.toHaveBeenCalled()
    expect(f.bridge.highlight).toHaveBeenCalledWith('A1:A10', context)
    expect(f.controller.state).toMatchObject({
      formula: '=SUM(A2:A10)',
      target: 'Budget!C2',
      bounds: { x: 392, y: 200 }
    })
  })
  it('requires presentation of all review pages and a fresh voice onset', async () => {
    const f = fixture()
    await proposed(f)
    await f.controller.confirm({ kind: 'held-mouth-gesture' })
    expect(f.bridge.writeFormula).not.toHaveBeenCalled()
    f.present()
    await f.controller.confirm({ kind: 'voice-confirm', tSpeechStart: 1000 })
    expect(f.bridge.writeFormula).not.toHaveBeenCalled()
    await f.controller.confirm(f.voice())
    expect(f.bridge.writeFormula).toHaveBeenCalledOnce()
    expect(isConfirmedAction(f.bridge.writeFormula.mock.calls[0]![0])).toBe(true)
  })
  it.each(['blink', 'wink', 'dwell'])(
    'rejects %s evidence while the card is visible',
    async (kind) => {
      const f = fixture()
      await proposed(f)
      f.present()
      await f.controller.confirm({ kind } as unknown as ConfirmationEvidence)
      expect(f.bridge.writeFormula).not.toHaveBeenCalled()
    }
  )
  it('rejects expired proposals', async () => {
    const f = fixture()
    await proposed(f)
    f.present()
    f.advance(60000)
    await f.controller.confirm(f.voice())
    f.controller.tick()
    expect(f.bridge.writeFormula).not.toHaveBeenCalled()
    expect(f.controller.state.phase).toBe('cancelled')
  })
  it('performs exactly one write for simultaneous confirmations', async () => {
    const f = fixture()
    await proposed(f)
    const id = f.present()
    await Promise.all([f.controller.confirm(f.voice(), id), f.controller.confirm(f.voice(), id)])
    await f.controller.confirm(f.voice(), id)
    expect(f.bridge.writeFormula).toHaveBeenCalledOnce()
    expect(f.controller.state).toMatchObject({
      phase: 'written',
      canUndo: true,
      previous: 'private original'
    })
  })
  it('invalidates the previous proposal immediately and passes bounded correction history', async () => {
    const requests: FormulaRequest[] = []
    const f = fixture(async (request) => {
      requests.push(request)
      return response
    })
    await proposed(f)
    const old = f.present()
    f.controller.start('no, use column B', 'yue', true)
    expect(f.gate.confirm(old, { kind: 'held-mouth-gesture' })).toBeNull()
    await f.controller.settle()
    expect(f.controller.state.correction).toBe(1)
    expect(f.controller.state.proposalId).not.toBe(old)
    expect(requests[1]).toMatchObject({
      lang: 'yue',
      utterance: 'no, use column B',
      history: [
        { role: 'user', content: 'sum prices' },
        { role: 'assistant', content: '=SUM(A2:A10)' }
      ]
    })
    expect(JSON.stringify(requests)).not.toContain('private original')
    await f.controller.confirm({ kind: 'held-mouth-gesture' }, old)
    expect(f.bridge.writeFormula).not.toHaveBeenCalled()
  })
  it('cancel and pause stay responsive while generation is unresolved; late results are ignored', async () => {
    let resolve!: (r: FormulaResponse) => void
    const f = fixture(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    f.controller.start('sum prices')
    await vi.waitFor(() => expect(resolve).toBeDefined())
    f.pause.toggle()
    expect(f.controller.state.phase).toBe('cancelled')
    resolve(response)
    await f.controller.settle()
    expect(f.controller.state.proposalId).toBeNull()
    expect(f.bridge.prepareFormula).not.toHaveBeenCalled()
  })
  it('restores the exact original content through a fresh confirmed restore action', async () => {
    const f = fixture()
    await proposed(f)
    f.present()
    await f.controller.confirm(f.voice())
    f.present()
    await f.controller.undo(f.voice())
    expect(f.bridge.restoreCell).toHaveBeenCalledOnce()
    const action = f.bridge.restoreCell.mock.calls[0]![0]
    expect(isConfirmedAction(action)).toBe(true)
    expect(action.action).toEqual({
      kind: 'excel-restore',
      content: { snapshot, expectedFormula: response.formula }
    })
    expect(f.controller.state.phase).toBe('idle')
  })
  it('a dwell Undo only proposes; mouth or voice must confirm it', async () => {
    const f = fixture()
    await proposed(f)
    f.present()
    await f.controller.confirm(f.voice())
    await f.controller.undo()
    expect(f.controller.state.phase).toBe('undo-proposed')
    expect(f.bridge.restoreCell).not.toHaveBeenCalled()
    f.present()
    await f.controller.confirm({ kind: 'held-mouth-gesture' })
    expect(f.bridge.restoreCell).toHaveBeenCalledOnce()
  })
  it('refuses confirmation if the foreground window has changed', async () => {
    const f = fixture()
    await proposed(f)
    f.present()
    f.foreground.mockResolvedValue({ appId: 'com.microsoft.Excel', windowTitle: 'Other workbook' })
    await f.controller.confirm(f.voice())
    expect(f.controller.state.phase).toBe('cancelled')
    expect(f.bridge.writeFormula).not.toHaveBeenCalled()
  })
  it('surfaces a thrown mutation error without retrying', async () => {
    const f = fixture()
    await proposed(f)
    f.present()
    f.bridge.writeFormula.mockRejectedValue(Error('connection lost'))
    await f.controller.confirm(f.voice())
    expect(f.controller.state).toMatchObject({ phase: 'error', proposalId: null, canUndo: false })
    expect(f.bridge.writeFormula).toHaveBeenCalledOnce()
  })
  it('does not offer confirmation if the bound destination cannot be prepared', async () => {
    const f = fixture()
    f.bridge.prepareFormula.mockResolvedValue(undefined)
    f.controller.start('sum prices')
    await f.controller.settle()
    expect(f.controller.state).toMatchObject({ phase: 'error', proposalId: null })
    expect(f.bridge.writeFormula).not.toHaveBeenCalled()
  })
  it('does not retry an ambiguous write outcome or offer undo', async () => {
    const f = fixture()
    f.bridge.writeFormula.mockResolvedValue(false)
    await proposed(f)
    f.present()
    await f.controller.confirm(f.voice())
    await f.controller.confirm(f.voice())
    expect(f.bridge.writeFormula).toHaveBeenCalledOnce()
    expect(f.controller.state).toMatchObject({ phase: 'error', canUndo: false })
  })
})
