import { describe, expect, it } from 'vitest'
import {
  buildExcelContext,
  collectSamples,
  columnLetter,
  detectHeaders,
  inferColumnType
} from './context'
import type { RawSheetSnapshot } from './context'

const snapshot: RawSheetSnapshot = {
  sheetName: 'Sheet1',
  selectionAddress: 'B2:C5',
  activeCell: 'B2',
  usedRangeAddress: 'A1:C4',
  values: [
    ['Name', 'Qty', 'Price'],
    ['Apple', '10', '1.50'],
    ['Pear', '5', '2.00'],
    ['Fig', '3', '0.75']
  ]
}

describe('columnLetter', () => {
  it('maps indices to Excel columns', () => {
    expect(columnLetter(0)).toBe('A')
    expect(columnLetter(25)).toBe('Z')
    expect(columnLetter(26)).toBe('AA')
  })
})

describe('inferColumnType', () => {
  it('classifies common column shapes', () => {
    expect(inferColumnType(['Apple', 'Pear'])).toBe('string')
    expect(inferColumnType(['10', '5', '3'])).toBe('number')
    expect(inferColumnType(['TRUE', 'FALSE'])).toBe('boolean')
    expect(inferColumnType(['2024-01-01', '2024-02-01'])).toBe('date')
    expect(inferColumnType(['#DIV/0!'])).toBe('error')
    expect(inferColumnType(['', ''])).toBe('empty')
    expect(inferColumnType(['10', 'ten'])).toBe('mixed')
  })
})

describe('detectHeaders', () => {
  it('returns the first row when it is text-shaped', () => {
    expect(detectHeaders(snapshot.values)).toEqual(['Name', 'Qty', 'Price'])
  })

  it('returns empty when the first row is numeric', () => {
    expect(
      detectHeaders([
        ['1', '2'],
        ['3', '4']
      ])
    ).toEqual([])
  })
})

describe('collectSamples', () => {
  it('collects up to 5 non-empty values per column below the header', () => {
    const samples = collectSamples(snapshot.values)
    expect(samples).toEqual([
      { column: 'A', values: ['Apple', 'Pear', 'Fig'] },
      { column: 'B', values: ['10', '5', '3'] },
      { column: 'C', values: ['1.50', '2.00', '0.75'] }
    ])
  })
})

describe('buildExcelContext', () => {
  it('omits samples when the toggle is off', () => {
    const context = buildExcelContext(snapshot, false)
    expect(context.samples).toBeUndefined()
    expect(context.headers).toEqual(['Name', 'Qty', 'Price'])
    expect(context.columnTypes).toEqual({ A: 'string', B: 'number', C: 'number' })
  })

  it('includes samples when the toggle is on', () => {
    const context = buildExcelContext(snapshot, true)
    expect(context.samples).toHaveLength(3)
    expect(context.samples?.[0]).toEqual({ column: 'A', values: ['Apple', 'Pear', 'Fig'] })
  })
})
