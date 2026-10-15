import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseDocument } from 'yaml'
import { CommandCatalogueSchema } from '@gestura/core'
export const repoRoot = resolve(import.meta.dirname, '../../..')
export async function compileCatalogue(): Promise<string> {
  const text = await readFile(resolve(repoRoot, 'packages/intent/commands.yaml'), 'utf8')
  const document = parseDocument(text, { uniqueKeys: true, strict: true })
  if (document.errors.length) throw new Error(document.errors.map((e) => e.message).join('\n'))
  const data = CommandCatalogueSchema.parse(document.toJS({ maxAliasCount: 0 }) as unknown)
  return `${JSON.stringify(data, null, 2)}\n`
}
export async function generateCatalogue(): Promise<void> {
  await writeFile(
    resolve(repoRoot, 'packages/intent/src/commands.generated.json'),
    await compileCatalogue()
  )
}
