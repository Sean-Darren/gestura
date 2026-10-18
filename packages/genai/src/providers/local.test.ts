import { describe, expect, it, vi } from 'vitest'
import { LocalProvider } from './local'

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response
}

describe('LocalProvider URL construction', () => {
  it('prepends http to a bare host:port value', async () => {
    const fetch = vi.fn(async () => jsonResponse({ message: { content: '{"status":"ok"}' } }))
    const provider = new LocalProvider({
      host: '127.0.0.1:11434',
      model: 'llama3.2',
      fetch: fetch as unknown as typeof globalThis.fetch,
      performance: { now: () => 0 } as typeof globalThis.performance
    })

    await provider.generate({ messages: [], jsonSchema: {} })

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/chat',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
