import {
  DEFAULT_SNAP_CONFIG,
  DEFAULT_SPEECH_CONFIG,
  DEFAULT_INTENT_CONFIG,
  DEFAULT_GENAI_CONFIG
} from '@gestura/core/config'
import { DEFAULT_GESTURE_CONFIG } from '@gestura/core/config'
import { DEFAULT_PALETTE_CONFIG } from '@gestura/core'
import { DEFAULT_EXCEL_CONFIG, DEFAULT_POINTER_CONFIG } from '@gestura/core/config'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadAppConfig, readEnvFile } from './config'

let temporaryDirectory = ''

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
  temporaryDirectory = ''
})

describe('local app config', () => {
  it('loads a validated allowlist and explicit local log opt-in', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'gestura-config-'))
    const path = join(temporaryDirectory, 'config.json')
    await writeFile(
      path,
      JSON.stringify({
        network: { allowlist: ['api.example.com'] },
        logging: { enabled: true }
      })
    )

    expect(loadAppConfig(path)).toEqual({
      network: { allowlist: ['api.example.com'] },
      logging: { enabled: true },
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

  it('fails closed to defaults when local config is invalid', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'gestura-config-'))
    const path = join(temporaryDirectory, 'config.json')
    await writeFile(path, JSON.stringify({ network: { allowlist: ['https://evil.example/path'] } }))

    expect(loadAppConfig(path).network.allowlist).toEqual(['127.0.0.1:11434'])
    expect(loadAppConfig(path).logging.enabled).toBe(false)
  })

  it('reads a local .env file without adding a runtime dependency', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'gestura-env-'))
    const path = join(temporaryDirectory, '.env')
    await writeFile(
      path,
      [
        '# local GenAI credentials',
        'OPENROUTER_API_KEY=sk-test',
        'OPENROUTER_MODEL="openai/gpt-4.1-mini"',
        "OPENROUTER_BASE_URL='https://openrouter.ai/api/v1'"
      ].join('\n')
    )

    expect(readEnvFile(path)).toEqual({
      OPENROUTER_API_KEY: 'sk-test',
      OPENROUTER_MODEL: 'openai/gpt-4.1-mini',
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1'
    })
  })

  it('uses OpenRouter env values when an env file is provided', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'gestura-env-config-'))
    const configPath = join(temporaryDirectory, 'config.json')
    const envPath = join(temporaryDirectory, '.env')
    await writeFile(configPath, JSON.stringify({}))
    await writeFile(
      envPath,
      [
        'OPENROUTER_API_KEY=sk-test',
        'OPENROUTER_MODEL=openai/gpt-4.1-mini',
        'OPENROUTER_BASE_URL=https://openrouter.ai/api/v1'
      ].join('\n')
    )

    const config = loadAppConfig(configPath, envPath)
    expect(config.genai.cloudProvider).toEqual({
      apiKey: 'sk-test',
      host: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-4.1-mini'
    })
    expect(config.network.allowlist).toContain('openrouter.ai')
  })
})
