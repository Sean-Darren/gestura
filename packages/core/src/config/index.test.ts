import { DEFAULT_GESTURE_CONFIG } from './index'
import { describe, expect, it } from 'vitest'
import {
  AppConfigSchema,
  DEFAULT_CONFIG,
  DEFAULT_POINTER_CONFIG,
  PointerConfigSchema,
  DEFAULT_UI_QUERY_CONFIG,
  UiQueryConfigSchema
} from './index'

describe('app config', () => {
  it('validates tunable pointer settings and keeps gaze disabled', () => {
    expect(DEFAULT_POINTER_CONFIG.gazeEnabled).toBe(false)
    expect(PointerConfigSchema.parse({ beta: 0.02 }).beta).toBe(0.02)
    for (const input of [
      { minCutoff: 0 },
      { beta: -1 },
      { deadZoneDeg: 8, yawRangeDeg: 5 },
      { gazeStableMs: 0 },
      { jitterThresholdPx: Infinity }
    ])
      expect(() => PointerConfigSchema.parse(input)).toThrow()
  })
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
    expect(DEFAULT_CONFIG).toEqual({
      network: { allowlist: [] },
      logging: { enabled: false },
      pointer: DEFAULT_POINTER_CONFIG,
      pointerProfile: { neutral: { yaw: 0, pitch: 0 } },
      gestures: DEFAULT_GESTURE_CONFIG
    })
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
