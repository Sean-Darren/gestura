import { FormulaBenchCasesSchema } from '@gestura/core'
import type { FormulaBenchCase } from '@gestura/core'
import type { FormulaRequest } from '@gestura/genai'
export function readCasesJson(text: string): FormulaBenchCase[] {
  if (text.length > 2_000_000) throw Error('Formula cases exceed 2 MB')
  return FormulaBenchCasesSchema.parse(JSON.parse(text) as unknown)
}
export function columnName(n: number): string {
  let s = ''
  for (let v = n + 1; v > 0; v = Math.floor((v - 1) / 26))
    s = String.fromCharCode(65 + ((v - 1) % 26)) + s
  return s
}
export function fixtureContext(
  c: FormulaBenchCase,
  shareSamples: boolean
): FormulaRequest['context'] {
  const { grid, name, targetCell } = c.sheet,
    columns = Math.max(...grid.map((r) => r.length))
  const columnTypes: Record<string, string> = {}
  for (let i = 0; i < columns; i++) {
    const types = new Set(
      grid
        .slice(1)
        .map((r) => r[i])
        .filter((v) => v !== null && v !== undefined)
        .map((v) => typeof v)
    )
    columnTypes[columnName(i)] = types.size === 1 ? [...types][0]! : types.size ? 'mixed' : 'empty'
  }
  return {
    sheetName: name,
    activeCell: targetCell,
    selectionAddress: targetCell,
    headers: grid[0]!.map((v) => String(v ?? '')),
    columnTypes,
    usedRangeAddress: `A1:${columnName(columns - 1)}${grid.length}`,
    ...(shareSamples
      ? {
          samples: Array.from({ length: columns }, (_, i) => ({
            column: columnName(i),
            values: grid.slice(1, 6).map((r) => String(r[i] ?? '').slice(0, 1000))
          })).filter((s) => s.values.length)
        }
      : {})
  }
}
