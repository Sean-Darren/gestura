import type { ExcelContext } from '@gestura/core'
import { buildExcelContext } from '../context'
import type { ExcelOfficeApi } from './bridge-client'

/** Thin Office.js adapter. The only place that touches the Excel host object model. */
export const officeApi: ExcelOfficeApi = {
  async getContext(includeSamples: boolean): Promise<ExcelContext> {
    return Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet()
      const usedRange = sheet.getUsedRange()
      const selection = context.workbook.getSelectedRange()
      const activeCell = context.workbook.getActiveCell()
      sheet.load('name')
      usedRange.load(['address', 'values'])
      selection.load('address')
      activeCell.load('address')
      await context.sync()
      const values = (usedRange.values ?? []) as unknown[][]
      return buildExcelContext(
        {
          sheetName: sheet.name,
          selectionAddress: selection.address,
          activeCell: activeCell.address,
          usedRangeAddress: usedRange.address,
          values: values.map((row) => row.map((cell) => (cell == null ? '' : String(cell))))
        },
        includeSamples
      )
    })
  },

  async writeFormula(formula: string, target: string): Promise<void> {
    await Excel.run(async (context) => {
      const range = context.workbook.worksheets.getActiveWorksheet().getRange(target)
      range.formulas = [[formula]]
      range.select()
      await context.sync()
    })
  },

  async selectRange(address: string): Promise<void> {
    await Excel.run(async (context) => {
      const range = context.workbook.worksheets.getActiveWorksheet().getRange(address)
      range.select()
      await context.sync()
    })
  }
}
