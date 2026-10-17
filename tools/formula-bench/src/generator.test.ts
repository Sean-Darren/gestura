import { describe, expect, it, vi } from 'vitest'
import { fixtureContext } from './cases'
import { FormulaBenchCaseSchema } from '@gestura/core'
import { routerGenerator } from './generator'
const c = FormulaBenchCaseSchema.parse({
  id: 'x',
  sheet: [['Amount'], [2]],
  utterance: 'sum all values',
  lang: 'en',
  expected: { value: 2 }
})
describe('provider accounting', () => {
  it('accounts for validation retries separately without losing usage', async () => {
    let attempt = 0
    const cloud = {
      id: 'cloud',
      generate: vi.fn(async () => ({
        provider: 'cloud',
        model: 'test',
        durationMs: 1,
        usage: { inputTokens: 10, outputTokens: 5 },
        json:
          ++attempt === 1
            ? {
                status: 'ok',
                formula: '=WEBSERVICE("bad")',
                targetCell: 'AZ1',
                references: [],
                functionsUsed: [],
                explanation: ''
              }
            : {
                status: 'ok',
                formula: '=SUM(A2:A2)',
                targetCell: 'AZ1',
                references: ['A2'],
                functionsUsed: ['SUM'],
                explanation: 'sum'
              }
      }))
    }
    const local = { id: 'local', generate: vi.fn() }
    const result = await routerGenerator({
      cloud,
      local,
      timeoutMs: 1000,
      maxRetries: 1,
      maxHistory: 10
    })(
      { utterance: c.utterance, lang: c.lang, context: fixtureContext(c, false), history: [] },
      new AbortController().signal
    )
    expect(result.calls).toHaveLength(2)
    expect(result.calls[0]).toMatchObject({
      model: 'test',
      inputTokens: 10,
      outputTokens: 5,
      failed: false
    })
    expect(result.response.status).toBe('ok')
    expect(local.generate).not.toHaveBeenCalled()
  })
})
