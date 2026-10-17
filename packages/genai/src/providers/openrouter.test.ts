import { expect, it, vi } from 'vitest'
import { CloudProvider } from './cloud'

it('uses the OpenRouter endpoint with strict structured output and privacy routing', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ message: { content: '{}' } }]
      })
    )
  )
  await new CloudProvider({
    host: 'https://openrouter.ai/api',
    apiKey: 'fake-key',
    model: 'openai/gpt-4.1-mini',
    fetch
  }).generate({ messages: [], jsonSchema: { type: 'object' } })
  expect(fetch.mock.calls[0]?.[0]).toBe('https://openrouter.ai/api/v1/chat/completions')
  const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
  expect(body.provider).toEqual({ require_parameters: true, data_collection: 'deny', zdr: true })
  expect(body.response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true } })
})
it('does not leak raw provider errors or authentication headers', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response('fake-secret', { status: 401 }))
  const provider = new CloudProvider({
    host: 'https://openrouter.ai/api',
    apiKey: 'fake-secret',
    model: 'm',
    fetch
  })
  await expect(provider.generate({ messages: [], jsonSchema: {} })).rejects.toThrow(
    'Cloud provider request failed'
  )
})
