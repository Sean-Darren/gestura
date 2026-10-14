import { describe, expect, it } from 'vitest'
import { AppConfigSchema, DEFAULT_CONFIG } from './index'

describe('app config', () => {
  it('defaults network access to an empty allowlist and logging to opt-out', () => {
    expect(DEFAULT_CONFIG).toEqual({ network: { allowlist: [] }, logging: { enabled: false } })
  })

  it('validates configured network hosts', () => {
    expect(
      AppConfigSchema.parse({ network: { allowlist: ['api.example.com'] } }).network.allowlist
    ).toEqual(['api.example.com'])
  })

  it('rejects a host entry containing a URL path', () => {
    expect(() =>
      AppConfigSchema.parse({ network: { allowlist: ['api.example.com/path'] } })
    ).toThrow()
  })
})
