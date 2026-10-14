import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createBlockedRequestLogger } from './local-log'

let temporaryDirectory = ''

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
  temporaryDirectory = ''
})

describe('local blocked request log', () => {
  it('writes only when opted in and allows the user to clear the file', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'gestura-network-log-'))
    const request = { url: 'https://example.com', method: 'GET', sessionId: 'session-1' }
    const disabled = createBlockedRequestLogger(false, temporaryDirectory)
    await disabled.log(request)
    await expect(readFile(disabled.path, 'utf8')).rejects.toThrow()

    const enabled = createBlockedRequestLogger(true, temporaryDirectory)
    await enabled.log(request)
    expect(await readFile(enabled.path, 'utf8')).toContain('https://example.com')
    await enabled.clear()
    await expect(readFile(enabled.path, 'utf8')).rejects.toThrow()
  })
})
