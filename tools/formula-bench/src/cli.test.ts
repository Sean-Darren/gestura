import { mkdtemp, mkdir, writeFile, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { runCli } from './cli'
describe('formula report output', () => {
  it('writes JSON and a markdown table locally with explicit mock labelling', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gestura-formula-bench-'))
    await mkdir(join(root, 'fixtures'))
    await writeFile(
      join(root, 'fixtures/cases.json'),
      JSON.stringify([
        { id: 'simple', sheet: [[1]], utterance: 'one', lang: 'en', expected: { value: 1 } }
      ])
    )
    await writeFile(
      join(root, 'fixtures/responses.json'),
      JSON.stringify({
        one: {
          status: 'ok',
          formula: '=1',
          targetCell: 'AZ1',
          references: [],
          functionsUsed: [],
          explanation: 'Scripted'
        }
      })
    )
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      await runCli(root, [
        '--cases',
        'fixtures/cases.json',
        '--responses',
        'fixtures/responses.json'
      ])
    } finally {
      output.mockRestore()
    }
    const files = await readdir(join(root, 'docs/benchmarks'))
    expect(files).toHaveLength(2)
    const json = JSON.parse(
      await readFile(
        join(
          root,
          'docs/benchmarks',
          files.find((f) => f.endsWith('.json'))!
        ),
        'utf8'
      )
    ) as { provider: string; totals: { cases: number }; inputs: { casesSha256: string } }
    expect(json.provider).toBe('mock')
    expect(json.totals.cases).toBe(1)
    expect(json.inputs.casesSha256).toMatch(/^[a-f0-9]{64}$/)
    const markdown = await readFile(
      join(
        root,
        'docs/benchmarks',
        files.find((f) => f.endsWith('.md'))!
      ),
      'utf8'
    )
    expect(markdown).toContain('First try')
    expect(markdown).toContain('not LLM quality')
  })
  it('refuses live mode from a Node-only invocation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gestura-formula-bench-'))
    await writeFile(
      join(root, 'cases.json'),
      JSON.stringify([
        { id: 'x', sheet: [[1]], utterance: 'one', lang: 'en', expected: { value: 1 } }
      ])
    )
    await expect(runCli(root, ['--provider', 'live', '--cases', 'cases.json'])).rejects.toThrow(
      'Electron main'
    )
  })
})
