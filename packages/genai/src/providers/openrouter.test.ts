import { expect, it, vi } from 'vitest'
import { CloudProvider, CloudProviderError } from './cloud'

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
  await expect(provider.generate({ messages: [], jsonSchema: {} })).rejects.toMatchObject({
    failure: 'authentication',
    message: 'Cloud provider request failed'
  })
})

it.each([
  [403, 'access'],
  [429, 'rate-limit'],
  [400, 'request'],
  [500, 'response']
] as const)('classifies HTTP %d without exposing provider details', async (status, failure) => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response('private provider body', { status }))
  const provider = new CloudProvider({
    host: 'https://openrouter.ai/api',
    apiKey: 'fake-key',
    model: 'm',
    fetch
  })
  await expect(provider.generate({ messages: [], jsonSchema: {} })).rejects.toBeInstanceOf(
    CloudProviderError
  )
  await expect(provider.generate({ messages: [], jsonSchema: {} })).rejects.toMatchObject({
    failure
  })
})

it('classifies unreachable providers as network failures', async () => {
  const provider = new CloudProvider({
    host: 'https://openrouter.ai/api',
    apiKey: 'fake-key',
    model: 'm',
    fetch: vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('private network error'))
  })
  await expect(provider.generate({ messages: [], jsonSchema: {} })).rejects.toMatchObject({
    failure: 'network'
  })
})
