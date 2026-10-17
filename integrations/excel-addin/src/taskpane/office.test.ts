import { afterEach, describe, expect, it, vi } from 'vitest'
import { officeApi } from './office'

afterEach(() => {
  officeApi.resetSession?.()
  vi.unstubAllGlobals()
})
function host(): {
  range: {
    formulas: string[][]
    valuesAsJson: { type: string; basicValue?: string }[][]
    load: ReturnType<typeof vi.fn>
    getSpecialCellsOrNullObject(): { isNullObject: boolean }
  }
  select: ReturnType<typeof vi.fn>
  sheet: { id: string }
  supported: ReturnType<typeof vi.fn>
} {
  const range = {
    formulas: [['=literal']],
    valuesAsJson: [[{ type: 'String', basicValue: '=literal' }]],
    load: vi.fn(),
    getSpecialCellsOrNullObject: () => ({
      isNullObject: range.valuesAsJson[0]![0]!.type !== 'Formula'
    })
  }
  const select = vi.fn(),
    sheet = { id: 'sheet-1', load: vi.fn(), getRange: () => range, getRanges: () => ({ select }) }
  const supported = vi.fn(() => true)
  vi.stubGlobal('Office', { context: { requirements: { isSetSupported: supported } } })
  vi.stubGlobal('Excel', {
    SpecialCellType: { formulas: 'Formulas' },
    run: async (cb: (ctx: unknown) => Promise<unknown>) =>
      cb({
        workbook: { worksheets: { getItem: () => sheet, getActiveWorksheet: () => sheet } },
        sync: async () => {}
      })
  })
  return { range, select, sheet, supported }
}
describe('Office.js cell adapter', () => {
  it('writes formula once and restores a leading equals sign as a typed string', async () => {
    const h = host()
    const s = await officeApi.prepareCell!('sheet-1', 'C2')
    expect(s.before).toEqual({ formula: null, value: '=literal' })
    await officeApi.commitFormula!(s, '=SUM(A1:A3)')
    expect(h.range.formulas).toEqual([['=SUM(A1:A3)']])
    h.range.valuesAsJson = [[{ type: 'Formula' }]]
    await officeApi.restoreCell!(s, '=SUM(A1:A3)')
    expect(h.range.valuesAsJson).toEqual([[{ type: 'String', basicValue: '=literal' }]])
  })
  it('refuses a different active sheet and unavailable safe-restore API', async () => {
    const h = host()
    h.sheet.id = 'other-sheet'
    await expect(officeApi.prepareCell!('sheet-1', 'C2')).rejects.toThrow('worksheet changed')
    h.supported.mockReturnValue(false)
    await expect(officeApi.prepareCell!('sheet-1', 'C2')).rejects.toThrow('1.16')
  })
  it('requires 1.18 for discontiguous column selection', async () => {
    const h = host()
    h.supported.mockReturnValue(false)
    await expect(officeApi.selectRange('A1:A10,C1:C10', 'sheet-1')).rejects.toThrow('1.18')
    expect(h.select).not.toHaveBeenCalled()
    h.supported.mockReturnValue(true)
    await officeApi.selectRange('A1:A10,C1:C10', 'sheet-1')
    expect(h.select).toHaveBeenCalledOnce()
  })
})
