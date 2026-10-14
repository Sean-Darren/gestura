import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

describe('network import boundaries', () => {
  it('catches network imports and globals in a restricted package', async () => {
    const root = process.cwd()
    const fixture = readFileSync(
      resolve(root, 'tools/lint-fixtures/network-violation.ts.fixture'),
      'utf8'
    )
    const eslint = new ESLint({ cwd: root })
    const results = await eslint.lintText(fixture, {
      filePath: resolve(root, 'packages/pointer/src/network-violation.fixture.ts')
    })
    const ruleIds = results.flatMap((result) => result.messages.map((message) => message.ruleId))

    expect(ruleIds).toContain('no-restricted-imports')
    expect(ruleIds).toContain('no-restricted-globals')
  })
})
