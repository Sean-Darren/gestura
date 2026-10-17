import { describe, expect, it, vi } from 'vitest'
import { allowlistedFetch, providerUrl } from './provider-fetch'
it('blocks non-allowlisted hosts, ports, credentials and protocols before transport', () => {
  const transport = vi.fn<typeof fetch>(),
    request = allowlistedFetch(transport, ['api.example.com', '127.0.0.1:11434'])
  for (const url of [
    'https://example.com',
    'https://api.example.com.evil.test',
    'https://api.example.com:444',
    'http://127.0.0.1:9999',
    'https://key@api.example.com',
    'file:///private/file'
  ])
    expect(() => request(url)).toThrow()
  expect(transport).not.toHaveBeenCalled()
})
it('uses exact host/port matching and refuses redirects even if callers request them', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}')),
    request = allowlistedFetch(transport, ['api.example.com'])
  await request('https://api.example.com/v1/chat/completions', { redirect: 'follow' })
  expect(transport).toHaveBeenCalledWith('https://api.example.com/v1/chat/completions', {
    redirect: 'error'
  })
})
describe('provider origins', () => {
  it('normalizes configured hosts without changing their role', () => {
    expect(providerUrl('api.example.com', false)).toBe('https://api.example.com')
    expect(providerUrl('127.0.0.1:11434', true)).toBe('http://127.0.0.1:11434')
    expect(() => providerUrl('https://secret@api.example.com', false)).toThrow()
  })
})
