import { describe, expect, it } from 'vitest'
import { FormulaBenchCaseSchema, FormulaBenchConfigSchema } from './formula-bench'
const base = { id: 'sample', sheet: [[1]], utterance: 'one', lang: 'en', expected: { value: 1 } }
describe('formula benchmark schemas', () => {
  it('normalizes raw grids with explicit safe defaults', () => {
    expect(FormulaBenchCaseSchema.parse(base).sheet).toEqual({
      name: 'Sheet1',
      grid: [[1]],
      targetCell: 'AZ1'
    })
    expect(FormulaBenchConfigSchema.parse({}).shareSamples).toBe(false)
  })
  it('bounds output cells and rejects unknown data/config fields', () => {
    expect(() =>
      FormulaBenchCaseSchema.parse({ ...base, sheet: { grid: [[1]], targetCell: 'A102' } })
    ).toThrow()
    expect(() =>
      FormulaBenchCaseSchema.parse({ ...base, sheet: { grid: [[1]], targetCell: 'BA1' } })
    ).toThrow()
    expect(() => FormulaBenchConfigSchema.parse({ apiKey: 'secret' })).toThrow()
  })
})
