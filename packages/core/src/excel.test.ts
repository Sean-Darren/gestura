import { describe, expect, it } from 'vitest'
import {
  ExcelContextSchema,
  ExcelCommandSchema,
  ExcelEventSchema,
  FormulaActionSchema
} from './excel'

describe('Excel bridge schemas', () => {
  const context = {
    sheetName: 'Sheet1',
    selectionAddress: 'B2:C5',
    activeCell: 'B2',
    headers: ['Name', 'Qty', 'Price'],
    columnTypes: { A: 'string', B: 'number', C: 'number' },
    usedRangeAddress: 'A1:C12'
  }

  it('accepts a complete context without samples', () => {
    expect(ExcelContextSchema.parse(context)).toEqual(context)
  })

  it('accepts optional samples capped at 5 values per column', () => {
    const parsed = ExcelContextSchema.parse({
      ...context,
      samples: [{ column: 'A', values: ['a', 'b', 'c', 'd', 'e'] }]
    })
    expect(parsed.samples?.[0]?.values).toHaveLength(5)
  })

  it('rejects more than 5 sample values per column', () => {
    expect(
      ExcelContextSchema.safeParse({
        ...context,
        samples: [{ column: 'A', values: ['1', '2', '3', '4', '5', '6'] }]
      }).success
    ).toBe(false)
  })

  it('rejects an out-of-bounds cell address', () => {
    expect(ExcelContextSchema.safeParse({ ...context, activeCell: 'ZZZZ999999' }).success).toBe(
      false
    )
  })

  it('rejects a malformed selection address', () => {
    expect(
      ExcelContextSchema.safeParse({ ...context, selectionAddress: 'not a range' }).success
    ).toBe(false)
  })

  it('validates the three command variants', () => {
    expect(
      ExcelCommandSchema.parse({
        type: 'getContext',
        id: 'c0ffee00-0000-4000-8000-000000000000',
        includeSamples: false
      })
    ).toMatchObject({ type: 'getContext' })
    expect(
      ExcelCommandSchema.parse({
        type: 'writeFormula',
        id: 'c0ffee00-0000-4000-8000-000000000000',
        formula: '=SUM(A1:A3)',
        target: 'C1'
      })
    ).toMatchObject({ type: 'writeFormula' })
    expect(
      ExcelCommandSchema.parse({
        type: 'selectRange',
        id: 'c0ffee00-0000-4000-8000-000000000000',
        address: 'A1:A10'
      })
    ).toMatchObject({ type: 'selectRange' })
  })

  it('rejects an unknown command type', () => {
    expect(ExcelCommandSchema.safeParse({ type: 'deleteAll' }).success).toBe(false)
  })

  it('rejects a writeFormula with a blank formula', () => {
    expect(
      ExcelCommandSchema.safeParse({
        type: 'writeFormula',
        id: 'c0ffee00-0000-4000-8000-000000000000',
        formula: '   ',
        target: 'C1'
      }).success
    ).toBe(false)
  })

  it('validates the event variants', () => {
    expect(ExcelEventSchema.parse({ type: 'ready' })).toEqual({ type: 'ready' })
    expect(
      ExcelEventSchema.parse({
        type: 'context',
        id: 'c0ffee00-0000-4000-8000-000000000000',
        context
      })
    ).toMatchObject({ type: 'context' })
    expect(
      ExcelEventSchema.parse({ type: 'done', id: 'c0ffee00-0000-4000-8000-000000000000' })
    ).toMatchObject({ type: 'done' })
    expect(ExcelEventSchema.parse({ type: 'error', message: 'boom' })).toMatchObject({
      type: 'error'
    })
  })

  it('accepts a confirmed formula action and rejects other kinds', () => {
    const formula = FormulaActionSchema.parse({
      kind: 'formula',
      content: { formula: '=IF(A1>0,"x","y")', target: 'D1' }
    })
    expect(formula.content.target).toBe('D1')
    expect(
      FormulaActionSchema.safeParse({ kind: 'type-text', content: { text: 'hi' } }).success
    ).toBe(false)
    expect(
      FormulaActionSchema.safeParse({ kind: 'formula', content: { formula: '', target: 'D1' } })
        .success
    ).toBe(false)
  })
})
