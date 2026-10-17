import { describe, expect, it } from 'vitest'
import { ExcelCommandSchema, ExcelSnapshotSchema, RestoreCellActionSchema } from './excel'
import { FormulaLoopStateSchema } from './formula-loop'
const snapshot = {
  token: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
  sheetId: 'sheet-1',
  target: 'C2',
  before: { formula: null, value: '=literal' }
}
describe('formula loop IPC contracts', () => {
  it('accepts only a bound single-cell snapshot and strict restore action', () => {
    expect(ExcelSnapshotSchema.safeParse(snapshot).success).toBe(true)
    expect(ExcelSnapshotSchema.safeParse({ ...snapshot, target: 'C2:D2' }).success).toBe(false)
    expect(
      RestoreCellActionSchema.safeParse({
        kind: 'excel-restore',
        content: { snapshot, expectedFormula: '=1' }
      }).success
    ).toBe(true)
    expect(
      ExcelCommandSchema.safeParse({
        type: 'restoreCell',
        id: crypto.randomUUID(),
        snapshot,
        expectedFormula: '=1',
        remoteUrl: 'https://example.com'
      }).success
    ).toBe(false)
  })
  it('bounds review state and rejects unknown fields', () => {
    const state = {
      phase: 'proposed',
      proposalId: crypto.randomUUID(),
      formula: '=1',
      explanation: 'One',
      target: 'Sheet1!C2',
      references: [],
      correction: 0,
      lang: 'en',
      previous: '',
      canUndo: false,
      bounds: { x: 12, y: 84, width: 320, height: 460 },
      reviewText: '=1',
      reviewPage: 0,
      reviewPages: 2,
      reviewKind: 'formula'
    }
    expect(FormulaLoopStateSchema.safeParse(state).success).toBe(true)
    expect(FormulaLoopStateSchema.safeParse({ ...state, correction: -1 }).success).toBe(false)
    expect(FormulaLoopStateSchema.safeParse({ ...state, execute: true }).success).toBe(false)
  })
})
