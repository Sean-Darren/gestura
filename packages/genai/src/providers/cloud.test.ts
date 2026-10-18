import { describe, expect, it, vi } from 'vitest'
import { CloudProvider } from './cloud'

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response
}

describe('CloudProvider URL construction', () => {
  it('prepends https and appends the OpenAI-compatible path for a bare host', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: '{"status":"ok"}' } }] })
    )
    const provider = new CloudProvider({
      host: 'api.example.com',
      apiKey: 'secret',
      model: 'example-model',
      fetch: fetch as unknown as typeof globalThis.fetch,
      performance: { now: () => 0 } as typeof globalThis.performance
    })

    await provider.generate({ messages: [], jsonSchema: {} })

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('preserves an explicit /api/v1 base URL for OpenRouter', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: '{"status":"ok"}' } }] })
    )
    const provider = new CloudProvider({
      host: 'https://openrouter.ai/api/v1',
      apiKey: 'secret',
      model: 'openai/gpt-4.1-mini',
      fetch: fetch as unknown as typeof globalThis.fetch,
      performance: { now: () => 0 } as typeof globalThis.performance
    })

    await provider.generate({ messages: [], jsonSchema: {} })

    expect(fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
