import { describe, expect, it, vi } from 'vitest'
import {
  FormulaBenchCaseSchema,
  FormulaBenchCasesSchema,
  FormulaBenchConfigSchema
} from '@gestura/core'
import type { FormulaBenchCase } from '@gestura/core'
import { readCasesJson, fixtureContext } from './cases'
import { evaluateFormula } from './evaluator'
import { evaluateCases, estimatedCost, quantiles, markdownReport } from './evaluate'
import { scriptedGenerator } from './generator'
const base = {
  id: 'sum',
  sheet: { grid: [['Amount'], [1], [2], [3]], targetCell: 'B2' },
  utterance: 'sum amounts',
  lang: 'en',
  category: 'aggregation',
  correctionUtterance: 'use SUM',
  expected: { value: 6 }
}
const good = {
  status: 'ok' as const,
  formula: '=SUM(A2:A4)',
  targetCell: 'B2',
  references: ['A2', 'A4'],
  functionsUsed: ['SUM'],
  explanation: 'Adds amounts'
}
const parsed = (change: Record<string, unknown> = {}): FormulaBenchCase =>
  FormulaBenchCaseSchema.parse({ ...base, ...change })
describe('JSON benchmark cases', () => {
  it('validates grids, duplicate IDs and exclusive expected formats', () => {
    expect(readCasesJson(JSON.stringify([base]))).toHaveLength(1)
    expect(FormulaBenchCasesSchema.safeParse([base, base]).success).toBe(false)
    expect(() => parsed({ expected: { value: 6, acceptedFormulas: ['=6'] } })).toThrow()
    expect(() => parsed({ sheet: { grid: [[]] } })).toThrow()
    expect(() => readCasesJson('x'.repeat(2000001))).toThrow('2 MB')
  })
  it('only includes up to five sample values per column after opt-in', () => {
    const c = parsed({
      sheet: { grid: [['Private'], [1], [2], [3], [4], [5], [6], [7]], targetCell: 'B2' }
    })
    expect(fixtureContext(c, false).samples).toBeUndefined()
    expect(fixtureContext(c, true).samples![0]!.values).toHaveLength(5)
    expect(JSON.stringify(fixtureContext(c, true))).not.toContain('expected')
  })
})
describe('spreadsheet value evaluation', () => {
  it('accepts equivalent formulas and isolates attempts from each other', () => {
    const c = parsed()
    expect(evaluateFormula(c, '=SUM(A2:A4)')).toBe(6)
    expect(evaluateFormula(c, '=A2+A3+A4')).toBe(6)
    expect(evaluateFormula(c, '=0')).toBe(0)
    expect(evaluateFormula(c, '=SUM(A2:A4)')).toBe(6)
    expect(c.sheet.grid[1]).toEqual([1])
  })
  it.each([
    '=WEBSERVICE("https://example.com")',
    '=SUM(A2:A100)',
    '=1/0',
    '=NO_SUCH_FN(A2)',
    '=TODAY()'
  ])('rejects unsafe, unsupported or invalid formula %s', (formula) => {
    expect(() => evaluateFormula(parsed(), formula)).toThrow()
  })
  it.each([
    {
      category: 'lookup',
      sheet: {
        grid: [
          ['Name', 'Amount'],
          ['Ada', 12],
          ['Bo', 25]
        ],
        targetCell: 'C2'
      },
      formula: '=VLOOKUP("Bo",A2:B3,2,FALSE)',
      value: 25
    },
    {
      category: 'logical',
      sheet: { grid: [['Score'], [80]], targetCell: 'B2' },
      formula: '=IF(A2>=60,"Pass","Fail")',
      value: 'Pass'
    },
    {
      category: 'date',
      sheet: {
        grid: [
          ['Year', 'Month', 'Day'],
          [2024, 2, 29]
        ],
        targetCell: 'D2'
      },
      formula: '=DAY(DATE(A2,B2,C2))',
      value: 29
    },
    {
      category: 'text',
      sheet: { grid: [['Name'], ['  hello  ']], targetCell: 'B2' },
      formula: '=UPPER(TRIM(A2))',
      value: 'HELLO'
    }
  ])('covers $category', ({ category, sheet, formula, value }) => {
    expect(evaluateFormula(parsed({ category, sheet }), formula)).toBe(value)
  })
})
describe('benchmark scoring and correction', () => {
  it('counts a first failure and recovery without leaking expected data', async () => {
    const generate = vi.fn(
      scriptedGenerator({ 'sum amounts': { ...good, formula: '=0' }, 'use SUM': good })
    )
    const report = await evaluateCases([parsed()], { generate, provider: 'mock' })
    expect(report.groups[0]).toMatchObject({ firstAccuracy: 0, afterCorrectionAccuracy: 1 })
    expect(report.rows[0]!.correction!.correct).toBe(true)
    expect(generate.mock.calls[1]![0].history).toEqual([
      { role: 'user', content: 'sum amounts' },
      { role: 'assistant', content: '=0' }
    ])
    expect(generate.mock.calls[0]![0]).not.toHaveProperty('expected')
    expect(generate.mock.calls[0]![0]).not.toHaveProperty('sheet')
    expect(report.totals.requests).toBe(2)
  })
  it('scores accepted formulas by value, not formula spelling', async () => {
    const report = await evaluateCases(
      [parsed({ expected: { acceptedFormulas: ['=SUM(A2:A4)'] } })],
      {
        generate: scriptedGenerator({ 'sum amounts': { ...good, formula: '=A2+A3+A4' } }),
        provider: 'mock'
      }
    )
    expect(report.rows[0]!.firstCorrect).toBe(true)
    expect(report.totals.requests).toBe(1)
  })
  it('keeps failures in language/category denominators and emits N/A for empty groups', async () => {
    const report = await evaluateCases([parsed({ correctionUtterance: undefined })], {
      generate: scriptedGenerator({}),
      provider: 'mock'
    })
    expect(report.groups.find((g) => g.group === 'lang:en')).toMatchObject({
      count: 1,
      firstAccuracy: 0,
      afterCorrectionAccuracy: 0
    })
    expect(report.groups.find((g) => g.group === 'category:lookup')!.firstAccuracy).toBeNull()
    expect(markdownReport(report)).toContain('N/A')
  })
  it('missing audio fails the case; audio transcription feeds initial and correction requests', async () => {
    const generate = scriptedGenerator({
      'heard wrong': { ...good, formula: '=0' },
      'heard correction': good
    })
    const missing = await evaluateCases([parsed()], { generate, provider: 'mock', mode: 'audio' })
    expect(missing.rows[0]!.afterCorrectionCorrect).toBe(false)
    const transcribe = vi.fn(async (file: string) => ({
      text: file === 'first.wav' ? 'heard wrong' : 'heard correction',
      tSpeechStart: 0
    }))
    const report = await evaluateCases(
      [parsed({ audioFile: 'first.wav', correctionAudioFile: 'next.wav' })],
      { generate, provider: 'mock', mode: 'audio', transcribe }
    )
    expect(report.rows[0]!.afterCorrectionCorrect).toBe(true)
    expect(transcribe).toHaveBeenCalledTimes(2)
  })
  it('rejects the wrong destination and supports explicit numeric tolerance', async () => {
    const wrong = await evaluateCases([parsed({ correctionUtterance: undefined })], {
      provider: 'mock',
      generate: scriptedGenerator({ 'sum amounts': { ...good, targetCell: 'C2' } })
    })
    expect(wrong.rows[0]!.first.error).toBe('Wrong destination cell')
    const rounded = await evaluateCases([parsed({ expected: { value: 6.00001 } })], {
      provider: 'mock',
      config: FormulaBenchConfigSchema.parse({ absoluteTolerance: 0.001 }),
      generate: scriptedGenerator({ 'sum amounts': good })
    })
    expect(rounded.rows[0]!.firstCorrect).toBe(true)
  })
  it('bounds an unresponsive generator by timeout', async () => {
    const report = await evaluateCases([parsed({ correctionUtterance: undefined })], {
      provider: 'live',
      config: FormulaBenchConfigSchema.parse({ timeoutMs: 100 }),
      generate: async () => new Promise(() => {})
    })
    expect(report.rows[0]!.firstCorrect).toBe(false)
    expect(report.rows[0]!.first.estimatedCostUsd).toBeNull()
  })
})
describe('latency and cost', () => {
  it('uses nearest-rank p50/p95 and handles no samples', () => {
    expect(quantiles([4, 1, 3, 2])).toEqual({ count: 4, p50: 2, p95: 4 })
    expect(quantiles([]).p50).toBeNull()
  })
  it('sums priced token usage and refuses missing/mismatched/failed usage', () => {
    const config = FormulaBenchConfigSchema.parse({
      pricing: {
        currency: 'USD',
        asOf: '2026-10-17',
        cloud: { model: 'test', inputPerMillion: 2, outputPerMillion: 4 }
      }
    })
    const calls = [
      { provider: 'cloud', model: 'test', inputTokens: 1000, outputTokens: 500, failed: false }
    ]
    expect(estimatedCost([...calls, ...calls], config, false)).toBe(0.008)
    expect(estimatedCost([{ ...calls[0]!, failed: true }], config, false)).toBeNull()
    expect(estimatedCost([{ ...calls[0]!, model: 'other' }], config, false)).toBeNull()
    expect(estimatedCost([], config, false)).toBeNull()
    expect(estimatedCost([], config, true)).toBe(0)
  })
})

describe('measurement integrity', () => {
  it('records generation time separately from fixture evaluation and correction totals', async () => {
    let t = 0,
      calls = 0
    const report = await evaluateCases([parsed()], {
      provider: 'mock',
      now: () => t,
      generate: async () => {
        t += ++calls === 1 ? 20 : 40
        return {
          response: { ...good, formula: calls === 1 ? '=0' : good.formula },
          calls: [{ provider: 'mock', failed: false }]
        }
      }
    })
    expect(report.groups[0]!.firstLatency).toMatchObject({ p50: 20, p95: 20 })
    expect(report.groups[0]!.correctionLatency.p50).toBe(40)
    expect(report.groups[0]!.endToEndLatency.p50).toBe(60)
  })
  it('preflights invalid expected formulas before sending any requests', async () => {
    const generate = vi.fn(scriptedGenerator({ 'sum amounts': good }))
    await expect(
      evaluateCases(
        [
          parsed(),
          parsed({ id: 'invalid', expected: { acceptedFormulas: ['=UNKNOWN_FUNCTION(A2)'] } })
        ],
        { generate, provider: 'mock' }
      )
    ).rejects.toThrow()
    expect(generate).not.toHaveBeenCalled()
  })
  it('does not invent generation latency or cost for missing audio, and redacts provider errors', async () => {
    const generate = vi.fn(async () => {
      throw Error('sk-private-provider-token')
    })
    const missing = await evaluateCases([parsed({ correctionUtterance: undefined })], {
      generate,
      provider: 'live',
      mode: 'audio'
    })
    expect(missing.groups[0]!.firstLatency.count).toBe(0)
    expect(missing.totals.requests).toBe(0)
    expect(missing.rows[0]!.first.estimatedCostUsd).toBe(0)
    const failure = await evaluateCases([parsed({ correctionUtterance: undefined })], {
      generate,
      provider: 'live'
    })
    expect(JSON.stringify(failure)).not.toContain('sk-private')
    expect(failure.totals.providerCalls).toBeNull()
  })
})
