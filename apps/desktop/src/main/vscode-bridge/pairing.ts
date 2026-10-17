import { mkdir, lstat, open, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { CodePairingSchema } from '@gestura/core'
import { loadNativeBinding } from '@gestura/native'
export async function publishPairing(
  home: string,
  value: unknown,
  protect: (directory: string) => void = (directory) =>
    loadNativeBinding().protectPairingDirectory(directory)
): Promise<() => Promise<void>> {
  const pairing = CodePairingSchema.parse(value),
    directory = join(home, '.gestura-vscode')
  await mkdir(directory, { mode: 0o700, recursive: false }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error
    }
  )
  const metadata = await lstat(directory)
  if (
    metadata.isSymbolicLink() ||
    !metadata.isDirectory() ||
    (process.getuid && metadata.uid !== process.getuid())
  )
    throw Error('Unsafe pairing directory')
  protect(directory) // Must succeed before the token is written, including on Windows.
  const temporary = join(directory, `${randomUUID()}.tmp`),
    target = join(directory, 'pairing.json')
  try {
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(JSON.stringify(pairing))
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true })
  }
  return () => rm(target, { force: true })
}
