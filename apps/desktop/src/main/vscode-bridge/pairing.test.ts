import { chmodSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, stat, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publishPairing } from './pairing'
let home = ''
afterEach(async () => {
  if (home) await rm(home, { recursive: true, force: true })
  home = ''
})
it('protects the directory before publishing and rotates a private token file', async () => {
  home = await mkdtemp(join(tmpdir(), 'gestura-pair-'))
  const protect = vi.fn(),
    token = 'a'.repeat(64)
  const remove = await publishPairing(home, { port: 3550, token }, protect)
  expect(protect).toHaveBeenCalledWith(join(home, '.gestura-vscode'))
  const path = join(home, '.gestura-vscode/pairing.json')
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ port: 3550, token })
  if (process.getuid) expect((await stat(path)).mode & 0o777).toBe(0o600)
  await publishPairing(home, { port: 3551, token: 'b'.repeat(64) }, protect)
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ port: 3551 })
  await remove()
})
it('does not publish a token if native ACL protection fails', async () => {
  home = await mkdtemp(join(tmpdir(), 'gestura-pair-'))
  await expect(
    publishPairing(home, { port: 3550, token: 'a'.repeat(64) }, () => {
      throw Error('ACL unavailable')
    })
  ).rejects.toThrow('ACL unavailable')
  await expect(readFile(join(home, '.gestura-vscode/pairing.json'))).rejects.toThrow()
})
it('repairs permissive directory mode through the platform protection hook', async () => {
  home = await mkdtemp(join(tmpdir(), 'gestura-pair-'))
  const first = await publishPairing(home, { port: 3550, token: 'a'.repeat(64) }, () => {})
  const directory = join(home, '.gestura-vscode')
  await chmod(directory, 0o755)
  await publishPairing(home, { port: 3550, token: 'b'.repeat(64) }, () => {
    chmodSync(directory, 0o700)
  })
  if (process.getuid) expect((await stat(directory)).mode & 0o777).toBe(0o700)
  await first()
})
