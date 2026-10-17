import { describe, expect, it } from 'vitest'
import { readCasesCsv } from './csv'

const minCSV = 'id,utterance,expected_status\n'

describe('readCasesCsv', () => {
  it('parses a minimal formula case', () => {
    const cases = readCasesCsv(`${minCSV}t1,Sum column B,ok`)
    expect(cases).toHaveLength(1)
    expect(cases[0]!.id).toBe('t1')
    expect(cases[0]!.expectedStatus).toBe('ok')
    expect(cases[0]!.context.sheetName).toBe('Sheet1')
  })

  it('rejects missing columns', () => {
    expect(() => readCasesCsv('id,utterance\n')).toThrow('missing columns')
  })

  it('rejects invalid status', () => {
    expect(() => readCasesCsv(`${minCSV}t1,hello,bad_value`)).toThrow('expected_status must be')
  })

  it('rejects duplicate IDs', () => {
    expect(() => readCasesCsv(`${minCSV}dup,sum a,ok\ndup,avg b,ok`)).toThrow('Duplicate case')
  })

  it('parses optional context fields', () => {
    const header =
      'id,utterance,expected_status,expected_formula,sheet_name,selection,active_cell,headers,column_types,used_range\n'
    const cases = readCasesCsv(
      `${header}t1,Sum B,ok,=SUM(B2:B100),My Sheet,B2,B2,"Name,Price","{""A"":""string"",""B"":""number""}",A1:B100`
    )
    expect(cases[0]!.context.sheetName).toBe('My Sheet')
    expect(cases[0]!.context.headers).toEqual(['Name', 'Price'])
    expect(cases[0]!.context.columnTypes).toEqual({ A: 'string', B: 'number' })
    expect(cases[0]!.context.usedRangeAddress).toBe('A1:B100')
    expect(cases[0]!.expectedFormula).toBe('=SUM(B2:B100)')
  })
})
