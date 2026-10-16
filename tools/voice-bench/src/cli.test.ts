import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
const directory = resolve(import.meta.dirname, '..')
it('runs the actual text CLI and emits valid JSON without requiring ASR', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--json'], {
    cwd: directory,
    encoding: 'utf8'
  })
  expect(result.status, result.stderr).toBe(0)
  const report = JSON.parse(result.stdout) as { mode: string; groups: { evaluated: number }[] }
  expect(report.mode).toBe('text')
  expect(report.groups[0]?.evaluated).toBe(60)
})
it('rejects invalid mode/options with a nonzero exit code', () => {
  for (const args of [['--mode', 'invalid'], ['--unknown']]) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
      cwd: directory,
      encoding: 'utf8'
    })
    expect(result.status).toBe(1)
    expect(result.stderr.length).toBeGreaterThan(0)
  }
})
