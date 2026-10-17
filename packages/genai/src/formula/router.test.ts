import { describe, expect, it, vi } from 'vitest'
import type { FormulaRequest, GenerateRequest, GenerateResponse } from '../index'
import { FormulaRouter } from './router'
const request: FormulaRequest = {
  utterance: 'sum A',
  lang: 'yue',
  context: {
    sheetName: 'Sheet1',
    activeCell: 'B2',
    selectionAddress: 'B2',
    headers: ['Price'],
    columnTypes: { A: 'number' },
    usedRangeAddress: 'A1:B10'
  },
  history: []
}
describe('formula request lifecycle', () => {
  it('passes Traditional HK output language to the provider', async () => {
    const generate = vi.fn<(request: GenerateRequest) => Promise<GenerateResponse>>(async () => ({
      json: {
        status: 'ok',
        formula: '=SUM(A2:A10)',
        targetCell: 'B2',
        references: ['A2', 'A10'],
        functionsUsed: ['SUM'],
        explanation: '加總'
      },
      provider: 'scripted',
      durationMs: 0
    }))
    const provider = { id: 'scripted', generate },
      router = new FormulaRouter({ cloud: provider, local: provider })
    await router.generate(request)
    expect(generate.mock.calls[0]![0].messages[0]!.content).toContain(
      'Traditional Chinese (Hong Kong)'
    )
  })
  it('cancels cloud generation without starting a local fallback', async () => {
    let signal: AbortSignal | undefined
    const cloud = {
      id: 'scripted',
      generate: vi.fn((r: GenerateRequest) => {
        signal = r.signal
        return new Promise<never>((_resolve, reject) =>
          r.signal?.addEventListener('abort', () => reject(Error('aborted')), { once: true })
        )
      })
    }
    const local = { id: 'local', generate: vi.fn() }
    const router = new FormulaRouter({ cloud, local }),
      abort = new AbortController()
    const pending = router.generate(request, abort.signal)
    abort.abort()
    await expect(pending).rejects.toThrow()
    expect(signal?.aborted).toBe(true)
    expect(local.generate).not.toHaveBeenCalled()
  })
})
it('returns safely when cloud fails and no local fallback is configured', async () => {
  const generate = vi.fn().mockRejectedValue(new Error('offline'))
  const router = new FormulaRouter({ cloud: { id: 'cloud', generate }, maxRetries: 0 })
  const result = await router.generate(request)
  expect(result.status).toBe('unsupported')
  expect(generate).toHaveBeenCalledOnce()
  if (result.status === 'unsupported') expect(result.explanation).not.toContain('Ollama')
})
