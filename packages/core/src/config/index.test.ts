import {
  DEFAULT_SNAP_CONFIG,
  DEFAULT_SPEECH_CONFIG,
  DEFAULT_INTENT_CONFIG,
  DEFAULT_GENAI_CONFIG
} from '@gestura/core/config'
import { DEFAULT_GESTURE_CONFIG } from './index'
import { DEFAULT_PALETTE_CONFIG } from '../palette'
import { describe, expect, it } from 'vitest'
import {
  AppConfigSchema,
  DEFAULT_CONFIG,
  DEFAULT_EXCEL_CONFIG,
  DEFAULT_POINTER_CONFIG,
  PointerConfigSchema,
  DEFAULT_UI_QUERY_CONFIG,
  UiQueryConfigSchema,
  GenaiConfigSchema
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

  it('defaults network access to localhost Ollama and logging to opt-out', () => {
    expect(DEFAULT_CONFIG).toEqual({
      network: { allowlist: ['127.0.0.1:11434'] },
      logging: { enabled: false },
      pointer: DEFAULT_POINTER_CONFIG,
      pointerProfile: { neutral: { yaw: 0, pitch: 0 } },
      gestures: DEFAULT_GESTURE_CONFIG,
      snapping: DEFAULT_SNAP_CONFIG,
      speech: DEFAULT_SPEECH_CONFIG,
      intent: DEFAULT_INTENT_CONFIG,
      palette: DEFAULT_PALETTE_CONFIG,
      excel: DEFAULT_EXCEL_CONFIG,
      genai: DEFAULT_GENAI_CONFIG
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

  it('defaults genai with local provider enabled and 8s formula timeout', () => {
    expect(DEFAULT_GENAI_CONFIG).toEqual({
      localProvider: { host: '127.0.0.1:11434', model: 'llama3.2', enabled: true },
      formula: { timeoutMs: 8000, maxRetries: 1, maxHistory: 20 }
    })
  })

  it('validates a genai config with cloud provider', () => {
    const parsed = GenaiConfigSchema.parse({
      cloudProvider: { apiKey: 'sk-test', host: 'api.openai.com', model: 'gpt-4' },
      localProvider: { host: '127.0.0.1:11434', model: 'llama3', enabled: false },
      formula: { timeoutMs: 5000, maxRetries: 2, maxHistory: 10 }
    })
    expect(parsed.cloudProvider).toEqual({
      apiKey: 'sk-test',
      host: 'api.openai.com',
      model: 'gpt-4'
    })
    expect(parsed.localProvider.enabled).toBe(false)
    expect(parsed.formula.timeoutMs).toBe(5000)
  })

  it('rejects genai formula timeout below 1000 ms', () => {
    expect(() => GenaiConfigSchema.parse({ formula: { timeoutMs: 500 } })).toThrow()
  })
})
