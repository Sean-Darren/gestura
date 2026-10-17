import { ExcelCellContentSchema } from '@gestura/core'
import type { ExcelContext, ExcelSnapshot } from '@gestura/core'
import { CellTransactions } from './cell-transactions'
import { buildExcelContext } from '../context'
import type { ExcelOfficeApi } from './bridge-client'

type Content = ExcelSnapshot['before']
async function accessCell(
  sheetId: string,
  target: string,
  replacement?: { expected: Content; next: Content }
): Promise<Content> {
  if (!Office.context.requirements.isSetSupported('ExcelApi', '1.16'))
    throw Error('Safe cell restore requires ExcelApi 1.16')
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItem(sheetId)
    const active = context.workbook.worksheets.getActiveWorksheet()
    const range = sheet.getRange(target)
    const formulas = range.getSpecialCellsOrNullObject(Excel.SpecialCellType.formulas)
    active.load('id')
    range.load(['formulas', 'valuesAsJson'])
    await context.sync()
    if (active.id !== sheetId) throw Error('The active worksheet changed')
    const cell = range.valuesAsJson[0]?.[0]
    const formula: unknown = formulas.isNullObject ? null : range.formulas[0]?.[0]
    const value =
      cell?.type === 'Empty' ? null : cell && 'basicValue' in cell ? cell.basicValue : undefined
    if (formula === null && cell && !['Empty', 'String', 'Double', 'Boolean'].includes(cell.type))
      throw Error('This cell type cannot be restored safely')
    const before = ExcelCellContentSchema.parse({ formula, value: formula !== null ? null : value })
    if (replacement) {
      const expected = replacement.expected
      if (
        before.formula !== expected.formula ||
        (before.formula === null && before.value !== expected.value)
      )
        throw Error('Cell changed since the proposal; nothing overwritten')
      if (replacement.next.formula !== null) range.formulas = [[replacement.next.formula]]
      else {
        const v = replacement.next.value
        range.valuesAsJson = [
          [
            typeof v === 'string'
              ? { type: 'String', basicValue: v }
              : typeof v === 'number'
                ? { type: 'Double', basicValue: v }
                : typeof v === 'boolean'
                  ? { type: 'Boolean', basicValue: v }
                  : { type: 'Empty' }
          ]
        ]
      }
      await context.sync()
    }
    return before
  })
}
const backend = {
  read: (sheetId: string, target: string) => accessCell(sheetId, target),
  replace: async (
    sheetId: string,
    target: string,
    expected: Content,
    next: Content
  ): Promise<void> => {
    await accessCell(sheetId, target, { expected, next })
  }
}
let transactions = new CellTransactions(backend, crypto.randomUUID())

/** Thin Office.js adapter. The only place that touches the Excel host object model. */
export const officeApi: ExcelOfficeApi = {
  get sessionId(): string {
    return transactions.sessionId
  },
  resetSession(): void {
    transactions.clear()
    transactions = new CellTransactions(backend, crypto.randomUUID())
  },
  prepareCell: (sheetId, target) => transactions.prepare(sheetId, target),
  commitFormula: (snapshot, formula) => transactions.commit(snapshot, formula),
  restoreCell: (snapshot, formula) => transactions.restore(snapshot, formula),
  async getContext(includeSamples: boolean): Promise<ExcelContext> {
    return Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet()
      const usedRange = sheet.getUsedRange()
      const selection = context.workbook.getSelectedRange()
      const activeCell = context.workbook.getActiveCell()
      sheet.load(['name', 'id'])
      usedRange.load(['address', 'values'])
      selection.load('address')
      activeCell.load('address')
      await context.sync()
      const values = (usedRange.values ?? []) as unknown[][]
      return {
        ...buildExcelContext(
          {
            sheetName: sheet.name,
            selectionAddress: selection.address,
            activeCell: activeCell.address,
            usedRangeAddress: usedRange.address,
            values: values.map((row) => row.map((cell) => (cell == null ? '' : String(cell))))
          },
          includeSamples
        ),
        sheetId: sheet.id,
        sessionId: transactions.sessionId
      }
    })
  },

  async writeFormula(formula: string, target: string): Promise<void> {
    await Excel.run(async (context) => {
      const range = context.workbook.worksheets.getActiveWorksheet().getRange(target)
      range.formulas = [[formula]]
      await context.sync()
    })
  },

  async selectRange(address: string, sheetId?: string): Promise<void> {
    await Excel.run(async (context) => {
      const sheet = sheetId
        ? context.workbook.worksheets.getItem(sheetId)
        : context.workbook.worksheets.getActiveWorksheet()
      if (address.includes(',') && !Office.context.requirements.isSetSupported('ExcelApi', '1.18'))
        throw Error('Selecting separate columns requires ExcelApi 1.18')
      const range = address.includes(',') ? sheet.getRanges(address) : sheet.getRange(address)
      range.select()
      await context.sync()
    })
  }
}
