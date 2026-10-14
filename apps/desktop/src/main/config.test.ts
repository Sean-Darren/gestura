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
      logging: { enabled: true }
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
