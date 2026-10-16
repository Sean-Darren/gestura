import {
  DEFAULT_SNAP_CONFIG,
  DEFAULT_SPEECH_CONFIG,
  DEFAULT_INTENT_CONFIG
} from '@gestura/core/config'
import { DEFAULT_GESTURE_CONFIG } from '@gestura/core/config'
import { DEFAULT_PALETTE_CONFIG } from '@gestura/core'
import { DEFAULT_EXCEL_CONFIG, DEFAULT_POINTER_CONFIG } from '@gestura/core/config'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadAppConfig } from './config'

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
      excel: DEFAULT_EXCEL_CONFIG
    })
  })

  it('fails closed to defaults when local config is invalid', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'gestura-config-'))
    const path = join(temporaryDirectory, 'config.json')
    await writeFile(path, JSON.stringify({ network: { allowlist: ['https://evil.example/path'] } }))

    expect(loadAppConfig(path).network.allowlist).toEqual([])
    expect(loadAppConfig(path).logging.enabled).toBe(false)
  })
})
