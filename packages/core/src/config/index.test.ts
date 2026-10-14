import { describe, expect, it } from 'vitest'
import {
  AppConfigSchema,
  DEFAULT_CONFIG,
  DEFAULT_UI_QUERY_CONFIG,
  UiQueryConfigSchema
} from './index'

describe('app config', () => {
  it('defaults and validates UI query settings', () => {
    expect(DEFAULT_UI_QUERY_CONFIG).toEqual({
      cacheMaxAgeMs: 500,
      timeoutMs: 250,
      probeRadiusPx: 150
    })
    expect(() => UiQueryConfigSchema.parse({ timeoutMs: 0 })).toThrow()
    expect(() => UiQueryConfigSchema.parse({ cacheMaxAgeMs: Infinity })).toThrow()
    expect(() => UiQueryConfigSchema.parse({ probeRadiusPx: -1 })).toThrow()
  })

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
