import { HyperFormula } from 'hyperformula'
import { validateFormula } from '@gestura/genai'
import type { FormulaBenchCase } from '@gestura/core'
import { fixtureContext } from './cases'
export type CellValue = string | number | boolean | null
export function evaluateFormula(c: FormulaBenchCase, formula: string): CellValue {
  if (!validateFormula(formula, fixtureContext(c, false).usedRangeAddress).valid)
    throw Error('Unsafe formula or reference outside fixture')
  // Only built-in spreadsheet expressions are evaluated. No custom plugins or JavaScript eval.
  if (/\b(TODAY|NOW|RAND|RANDBETWEEN)\s*\(/i.test(formula))
    throw Error('Volatile functions are not reproducible')
  const hf = HyperFormula.buildFromSheets(
    { [c.sheet.name]: c.sheet.grid.map((r) => [...r]) },
    { licenseKey: 'gpl-v3', useColumnIndex: false, maxRows: 101, maxColumns: 52 }
  )
  try {
    // HyperFormula treats bare Excel boolean constants as named expressions.
    hf.addNamedExpression('TRUE', true)
    hf.addNamedExpression('FALSE', false)
    const address = hf.simpleCellAddressFromString(c.sheet.targetCell, 0)
    if (!address) throw Error('Invalid output cell')
    hf.setCellContents(address, [[formula]])
    const value = hf.getCellValue(address)
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value))
      throw Error(`Evaluator error: ${String(value)}`)
    if (typeof value === 'number' && !Number.isFinite(value)) throw Error('Non-finite result')
    return value as CellValue
  } finally {
    hf.destroy()
  }
}
export function equalValues(
  a: CellValue,
  b: CellValue,
  absolute: number,
  relative: number
): boolean {
  return typeof a === 'number' && typeof b === 'number'
    ? Math.abs(a - b) <= absolute + relative * Math.max(Math.abs(a), Math.abs(b))
    : a === b
}
