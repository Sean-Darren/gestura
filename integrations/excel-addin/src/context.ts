import type { ExcelColumnType, ExcelContext, ExcelSample } from '@gestura/core'

/**
 * Pure helpers for turning an Office.js sheet snapshot into a validated
 * `ExcelContext`. No DOM, no Office.js — kept testable without a host.
 */

export interface RawSheetSnapshot {
  sheetName: string
  selectionAddress: string
  activeCell: string
  usedRangeAddress: string
  values: string[][]
}

export function columnLetter(index: number): string {
  let value = ''
  let n = index
  while (n >= 0) {
    value = String.fromCharCode(65 + (n % 26)) + value
    n = Math.floor(n / 26) - 1
  }
  return value
}

const EXCEL_ERRORS = new Set([
  '#N/A',
  '#VALUE!',
  '#REF!',
  '#DIV/0!',
  '#NAME?',
  '#NULL!',
  '#NUM!',
  '#SPILL!',
  '#CALC!',
  '#FIELD!',
  '#BLOCKED!'
])

function classify(value: string): ExcelColumnType {
  if (EXCEL_ERRORS.has(value)) return 'error'
  if (value === 'TRUE' || value === 'FALSE') return 'boolean'
  const stripped = value.replace(/[,$%\s]/g, '')
  if (stripped !== '' && Number.isFinite(Number(stripped))) return 'number'
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(value.trim())) return 'date'
  return 'string'
}

export function inferColumnType(values: readonly string[]): ExcelColumnType {
  const nonEmpty = values.filter((value) => value.trim() !== '')
  if (nonEmpty.length === 0) return 'empty'
  const kinds = new Set(nonEmpty.map(classify))
  if (kinds.has('error')) return 'error'
  if (kinds.size === 1) return [...kinds][0]!
  return 'mixed'
}

/** The first row is treated as headers only when it is text-shaped and non-empty. */
export function detectHeaders(values: readonly string[][]): string[] {
  const first = values[0]
  if (!first || first.every((value) => value.trim() === '')) return []
  const looksTextual = first.some((value) => value.trim() !== '' && classify(value) === 'string')
  if (!looksTextual) return []
  return first.map((value) => value.trim())
}

export function collectSamples(values: readonly string[][], maxPerColumn = 5): ExcelSample[] {
  if (values.length === 0) return []
  const width = values.reduce((max, row) => Math.max(max, row.length), 0)
  const samples: ExcelSample[] = []
  for (let column = 0; column < width; column++) {
    const columnValues = values
      .slice(1)
      .map((row) => row[column] ?? '')
      .filter((value) => value.trim() !== '')
    if (columnValues.length === 0) continue
    samples.push({ column: columnLetter(column), values: columnValues.slice(0, maxPerColumn) })
  }
  return samples
}

export function buildExcelContext(
  snapshot: RawSheetSnapshot,
  includeSamples: boolean
): ExcelContext {
  const headers = detectHeaders(snapshot.values)
  const width = snapshot.values.reduce((max, row) => Math.max(max, row.length), 0)
  const columnTypes: Record<string, ExcelColumnType> = {}
  for (let column = 0; column < width; column++) {
    columnTypes[columnLetter(column)] = inferColumnType(
      snapshot.values.slice(1).map((row) => row[column] ?? '')
    )
  }
  const samples = includeSamples ? collectSamples(snapshot.values) : undefined
  return {
    sheetName: snapshot.sheetName,
    selectionAddress: snapshot.selectionAddress,
    activeCell: snapshot.activeCell,
    headers,
    columnTypes,
    usedRangeAddress: snapshot.usedRangeAddress,
    ...(samples ? { samples } : {})
  }
}
