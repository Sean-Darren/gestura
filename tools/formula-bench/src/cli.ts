import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { FormulaBenchConfigSchema } from '@gestura/core'
import { readCasesJson } from './cases'
import { scriptedGenerator } from './generator'
import { evaluateCases, markdownReport } from './evaluate'
import type { Generator } from './evaluate'
export type LiveFactory = (path: string) => Promise<Generator>
export async function runCli(rootDir: string, args: string[], live?: LiveFactory): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      cases: { type: 'string', default: 'fixtures/formula-cases/p4.4-cases.json' },
      provider: { type: 'string', default: 'mock' },
      mode: { type: 'string', default: 'text' },
      responses: { type: 'string', default: 'fixtures/formula-cases/p4.4-mock-responses.json' },
      config: { type: 'string' },
      'app-config': { type: 'string' },
      'share-samples': { type: 'boolean', default: false }
    },
    strict: true
  })
  if (values.mode !== 'text' && values.mode !== 'audio') throw Error('--mode must be text or audio')
  if (values.provider !== 'mock' && values.provider !== 'live')
    throw Error('--provider must be mock or live')
  const config = FormulaBenchConfigSchema.parse({
    ...(values.config
      ? (JSON.parse(await readFile(resolve(rootDir, values.config), 'utf8')) as object)
      : {}),
    shareSamples: values['share-samples']
  })
  const casesText = await readFile(resolve(rootDir, values.cases), 'utf8')
  const cases = readCasesJson(casesText)
  const inputs: { casesSha256: string; responsesSha256?: string } = {
    casesSha256: createHash('sha256').update(casesText).digest('hex')
  }
  let generate: Generator
  if (values.provider === 'live') {
    if (!live || !values['app-config'])
      throw Error('Live mode requires Electron main and --app-config path')
    generate = await live(resolve(rootDir, values['app-config']))
  } else {
    const responseText = await readFile(resolve(rootDir, values.responses), 'utf8')
    inputs.responsesSha256 = createHash('sha256').update(responseText).digest('hex')
    const responses: unknown = JSON.parse(responseText)
    if (!responses || typeof responses !== 'object' || Array.isArray(responses))
      throw Error('Expected response map')
    generate = scriptedGenerator(responses as Record<string, unknown>)
  }
  const abort = new AbortController(),
    cancel = (): void => abort.abort()
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  try {
    const transcribe =
      values.mode === 'audio'
        ? async (file: string, signal?: AbortSignal) =>
            (await import('../../voice-bench/src/asr')).transcribeFixture(file, signal)
        : undefined
    const report = await evaluateCases(cases, {
      generate,
      provider: values.provider,
      mode: values.mode,
      config,
      signal: abort.signal,
      ...(transcribe ? { transcribe } : {})
    })
    const directory = resolve(rootDir, 'docs/benchmarks')
    await mkdir(directory, { recursive: true })
    const prefix = `formula-${values.provider}-${values.mode}-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`
    await writeFile(
      resolve(directory, `${prefix}.json`),
      JSON.stringify({ generatedAt: new Date().toISOString(), inputs, ...report }, null, 2) + '\n',
      { flag: 'wx' }
    )
    await writeFile(
      resolve(directory, `${prefix}.md`),
      markdownReport(report) + `\nCases SHA-256: ${inputs.casesSha256}\n`,
      { flag: 'wx' }
    )
    process.stdout.write(
      markdownReport(report) + `\nReports: docs/benchmarks/${prefix}.{json,md}\n`
    )
    if (report.groups[0]!.afterCorrectionCorrect !== cases.length) process.exitCode = 1
  } finally {
    process.removeListener('SIGINT', cancel)
    process.removeListener('SIGTERM', cancel)
  }
}
