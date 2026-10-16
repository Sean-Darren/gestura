import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { compileCatalogue, repoRoot } from './catalogue'
import { IntentMatcher } from '@gestura/intent'
import { CommandCatalogueSchema } from '@gestura/core'
it('keeps the checked-in pure catalogue in sync with commands.yaml', async () => {
  expect(
    await readFile(resolve(repoRoot, 'packages/intent/src/commands.generated.json'), 'utf8')
  ).toBe(await compileCatalogue())
})
it('matches every authored phrasing and validates all intent and slot definitions', async () => {
  const data = CommandCatalogueSchema.parse(JSON.parse(await compileCatalogue()))
  const matcher = new IntentMatcher()
  for (const command of data.commands)
    for (const phrasings of Object.values(command.phrasings))
      for (const template of phrasings) {
        const text = template.replace('{range}', 'B2').replace('{request}', 'Sum A1:A10')
        const result = matcher.match(text, { pendingProposal: true }, 100)
        expect(result, text).toMatchObject({ kind: 'match', intent: { id: command.id } })
      }
})
it('rejects weakened confirmation definitions, duplicated ids and invalid template slots', async () => {
  const original: unknown = JSON.parse(await compileCatalogue())
  for (const change of ['confirm', 'duplicate', 'slot', 'suffix']) {
    const data = CommandCatalogueSchema.parse(structuredClone(original))
    const command = data.commands.find(
      (command) => command.id === (change === 'confirm' ? 'confirm' : 'formula-request')
    )!
    if (change === 'confirm') command.exactOnly = false
    else if (change === 'duplicate') data.commands[0]!.id = data.commands[1]!.id
    else
      command.phrasings.en = [
        change === 'slot' ? 'formula {unexpected}' : 'formula {request} please'
      ]
    expect(CommandCatalogueSchema.safeParse(data).success).toBe(false)
  }
})
