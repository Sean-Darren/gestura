import { describe, expect, it } from 'vitest'
import {
  FormulaRequestSchema,
  FormulaResponseSchema,
  buildFormulaContext,
  validateFormula,
  isSingleFunction,
  MockProvider,
  FormulaRouter
} from './index'

describe('FormulaRequestSchema', () => {
  const minimalCtx = {
    sheetName: 'Sheet1',
    selectionAddress: 'A1',
    activeCell: 'A1',
    headers: ['Name', 'Price', 'Qty'],
    columnTypes: { A: 'string', B: 'number', C: 'number' },
    usedRangeAddress: 'A1:C100',
    history: []
  }

  it('parses a minimal formula request', () => {
    const parsed = FormulaRequestSchema.parse({
      utterance: 'Sum column B',
      context: minimalCtx
    })
    expect(parsed.utterance).toBe('Sum column B')
    expect(parsed.lang).toBe('en')
    expect(parsed.history).toEqual([])
  })

  it('rejects empty utterances', () => {
    expect(() => FormulaRequestSchema.parse({ utterance: '', context: minimalCtx })).toThrow()
  })

  it('rejects utterances over 2000 characters', () => {
    expect(() =>
      FormulaRequestSchema.parse({
        utterance: 'x'.repeat(2001),
        context: minimalCtx
      })
    ).toThrow()
  })

  it('accepts optional samples in context', () => {
    const parsed = FormulaRequestSchema.parse({
      utterance: 'Test',
      context: {
        ...minimalCtx,
        samples: [{ column: 'A', values: ['Alice', 'Bob'] }]
      }
    })
    expect(parsed.context.samples).toEqual([{ column: 'A', values: ['Alice', 'Bob'] }])
  })
})

describe('FormulaResponseSchema', () => {
  it('parses an ok response', () => {
    const parsed = FormulaResponseSchema.parse({
      status: 'ok',
      formula: '=SUM(B2:B100)',
      targetCell: 'B101',
      references: ['B2', 'B100'],
      functionsUsed: ['SUM'],
      explanation: 'Adds all values in column B'
    })
    expect(parsed.status).toBe('ok')
    if (parsed.status === 'ok') expect(parsed.formula).toBe('=SUM(B2:B100)')
  })

  it('parses a needs_clarification response', () => {
    const parsed = FormulaResponseSchema.parse({
      status: 'needs_clarification',
      clarificationQuestion: 'Which column?'
    })
    expect(parsed.status).toBe('needs_clarification')
  })

  it('parses an unsupported response', () => {
    const parsed = FormulaResponseSchema.parse({
      status: 'unsupported',
      explanation: 'Cannot do that'
    })
    expect(parsed.status).toBe('unsupported')
  })

  it('rejects explanation over 500 characters', () => {
    expect(() =>
      FormulaResponseSchema.parse({
        status: 'unsupported',
        explanation: 'x'.repeat(501)
      })
    ).toThrow()
  })
})

describe('buildFormulaContext', () => {
  const excelContext = {
    sheetName: 'Sales',
    selectionAddress: 'B2',
    activeCell: 'B2',
    headers: ['Product', 'Revenue', 'Units'],
    columnTypes: { A: 'string', B: 'number', C: 'number' } as const,
    usedRangeAddress: 'A1:C50',
    samples: [
      { column: 'A', values: ['Widget', 'Gadget', 'Doohickey'] },
      { column: 'B', values: ['100', '200', '150'] }
    ]
  }

  it('excludes sample values when shareSamples is false (Q15)', () => {
    const result = buildFormulaContext(excelContext, false)
    expect(result.samples).toBeUndefined()
    expect(result.sheetName).toBe('Sales')
    expect(result.headers).toEqual(['Product', 'Revenue', 'Units'])
    expect(result.columnTypes).toEqual({ A: 'string', B: 'number', C: 'number' })
    expect(result.usedRangeAddress).toBe('A1:C50')
  })

  it('includes sample values when shareSamples is true (Q15)', () => {
    const result = buildFormulaContext(excelContext, true)
    expect(result.samples).toEqual([
      { column: 'A', values: ['Widget', 'Gadget', 'Doohickey'] },
      { column: 'B', values: ['100', '200', '150'] }
    ])
  })

  it('does not include samples when array is empty even with toggle', () => {
    const result = buildFormulaContext({ ...excelContext, samples: [] }, true)
    expect(result.samples).toBeUndefined()
  })

  it('does not include samples when undefined even with toggle', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { samples, ...noSamples } = excelContext
    const result = buildFormulaContext(noSamples, true)
    expect(result.samples).toBeUndefined()
  })
})

describe('validateFormula', () => {
  it('accepts a valid SUM formula within range', () => {
    const result = validateFormula('=SUM(A1:A10)', 'A1:C100')
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('rejects formulas that do not start with =', () => {
    const result = validateFormula('SUM(A1:A10)', 'A1:C100')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Formula must start with =')
  })

  it('rejects WEBSERVICE as an unsafe function', () => {
    const result = validateFormula('=WEBSERVICE("http://example.com")', 'A1:A10')
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('WEBSERVICE'))).toBe(true)
  })

  it('rejects RTD as an unsafe function', () => {
    const result = validateFormula('=RTD("progid",,"server","topic1")', 'A1:A10')
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('RTD'))).toBe(true)
  })

  it('flags references outside the used range', () => {
    const result = validateFormula('=SUM(A1:A10)', 'B1:B5')
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('A1') && e.includes('outside'))).toBe(true)
  })

  it('accepts a formula without cell references', () => {
    const result = validateFormula('=TODAY()', 'A1:C100')
    expect(result.valid).toBe(true)
  })
})

describe('isSingleFunction', () => {
  it('returns true for formulas with one function', () => {
    expect(isSingleFunction('=SUM(A1:A10)')).toBe(true)
    expect(isSingleFunction('=VLOOKUP(E1,A1:B200,2,FALSE)')).toBe(true)
    expect(isSingleFunction('=IFERROR(B2/C2,"")')).toBe(true)
  })

  it('returns false for formulas with multiple functions', () => {
    expect(isSingleFunction('=IF(SUM(A1:A10)>100,AVERAGE(B1:B10),0)')).toBe(false)
  })

  it('returns false for non-formula strings', () => {
    expect(isSingleFunction('hello')).toBe(false)
  })

  it('returns true for formulas with no functions (plain references)', () => {
    expect(isSingleFunction('=A1+B1')).toBe(true)
  })
})

describe('MockProvider', () => {
  it('returns canned responses for known keys', async () => {
    const provider = new MockProvider({
      responses: {
        'Sum column B': {
          status: 'ok',
          formula: '=SUM(B2:B100)',
          targetCell: 'B101',
          references: ['B2', 'B100'],
          functionsUsed: ['SUM'],
          explanation: 'Adds all values in B'
        }
      }
    })

    const result = await provider.generate({
      messages: [{ role: 'user', content: 'Sum column B' }],
      jsonSchema: {}
    })

    expect(result.provider).toBe('mock')
    const resp = result.json as Record<string, unknown>
    expect(resp.status).toBe('ok')
  })

  it('returns unsupported for unknown keys', async () => {
    const provider = new MockProvider({})
    const result = await provider.generate({
      messages: [{ role: 'user', content: 'Unknown request' }],
      jsonSchema: {}
    })
    const resp = result.json as Record<string, unknown>
    expect(resp.status).toBe('unsupported')
  })

  it('respects AbortSignal', async () => {
    const provider = new MockProvider({ responses: {}, latencyMs: 1000 })
    const controller = new AbortController()
    controller.abort()
    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'test' }],
        jsonSchema: {},
        signal: controller.signal
      })
    ).rejects.toThrow()
  })
})

describe('FormulaRouter', () => {
  const okResponse = {
    status: 'ok' as const,
    formula: '=SUM(B2:B100)',
    targetCell: 'B101',
    references: ['B2', 'B100'],
    functionsUsed: ['SUM'],
    explanation: 'Sums column B'
  }

  it('routes to cloud provider successfully', async () => {
    const cloud = new MockProvider({ responses: { 'Sum column B': okResponse } })
    const local = new MockProvider({ responses: {} })
    const router = new FormulaRouter({ cloud, local, timeoutMs: 5000 })

    const result = await router.generate({
      utterance: 'Sum column B',
      lang: 'en',
      context: {
        sheetName: 'Sheet1',
        selectionAddress: 'B2',
        activeCell: 'B2',
        headers: ['Name', 'Price'],
        columnTypes: { A: 'string', B: 'number' },
        usedRangeAddress: 'A1:B100'
      },
      history: []
    })

    expect(result.status).toBe('ok')
  })

  it('falls back to local provider on cloud failure for single-function requests', async () => {
    const cloud = new MockProvider({ throwOnUnknown: true })
    const local = new MockProvider({ responses: { 'calculate the sum of column B': okResponse } })
    const router = new FormulaRouter({ cloud, local, timeoutMs: 5000 })

    const result = await router.generate({
      utterance: 'calculate the sum of column B',
      lang: 'en',
      context: {
        sheetName: 'Sheet1',
        selectionAddress: 'B2',
        activeCell: 'B2',
        headers: ['Name', 'Price'],
        columnTypes: { A: 'string', B: 'number' },
        usedRangeAddress: 'A1:B100'
      },
      history: []
    })

    expect(result.status).toBe('ok')
  })

  it('returns unsupported when both providers fail', async () => {
    const cloud = new MockProvider({ throwOnUnknown: true })
    const local = new MockProvider({ throwOnUnknown: true })
    const router = new FormulaRouter({ cloud, local, timeoutMs: 1000 })

    // Use a non-single-function utterance so it doesn't attempt local fallback
    const result = await router.generate({
      utterance: 'complex nested calculation with multiple operations',
      lang: 'en',
      context: {
        sheetName: 'Sheet1',
        selectionAddress: 'A1',
        activeCell: 'A1',
        headers: [],
        columnTypes: {},
        usedRangeAddress: 'A1:Z100'
      },
      history: []
    })

    // non-single-function with cloud failure → unsupported without local attempt
    expect(result.status).toBe('unsupported')
  })

  it('retries once on validation failure', async () => {
    const invalidFirst = {
      status: 'ok' as const,
      formula: '=WEBSERVICE("http://bad.com")',
      targetCell: 'A1',
      references: [],
      functionsUsed: ['WEBSERVICE'],
      explanation: 'bad'
    }
    // Mock returns invalid formula every time — should exhaust retries
    const cloud = new MockProvider({ responses: { 'sum B': invalidFirst } })
    const local = new MockProvider({ responses: {} })
    const router = new FormulaRouter({ cloud, local, timeoutMs: 5000 })

    const result = await router.generate({
      utterance: 'sum B',
      lang: 'en',
      context: {
        sheetName: 'Sheet1',
        selectionAddress: 'A1',
        activeCell: 'A1',
        headers: ['B'],
        columnTypes: { B: 'number' },
        usedRangeAddress: 'A1:Z100'
      },
      history: []
    })

    expect(result.status).toBe('unsupported')
  })
})
