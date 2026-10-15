import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { readCasesCsv } from './csv'
import { evaluateCases, markdownReport } from './evaluate'
import { repoRoot } from './catalogue'
it('runs the synthetic multilingual text set in CI without audio/models and meets the scripted target', async () => {
  const cases = readCasesCsv(
    await readFile(resolve(repoRoot, 'fixtures/transcripts/p3.2-commands.csv'), 'utf8')
  )
  const report = await evaluateCases(cases, { mode: 'text' })
  expect(cases).toHaveLength(60)
  for (const group of report.groups) {
    expect(group.errors).toBe(0)
    expect(group.exactAccuracy).toBeGreaterThanOrEqual(0.9)
    expect(group.evaluated).toBe(group.group === 'overall' ? 60 : 20)
  }
  expect(markdownReport(report)).toContain('| mixed |')
})
it('runs audio transcription before matching, uses fixture language, and reports errors/skips without inflating accuracy', async () => {
  const cases = readCasesCsv(
    'id,utterance,expected intent,slots,lang,audio\na,wrong text,pause,{},mixed,a.wav\nb,click,click,{},en,\nc,click,click,{},yue,bad.wav\n'
  )
  const report = await evaluateCases(cases, {
    mode: 'audio',
    transcribe: async (audio) => {
      if (audio === 'bad.wav') throw new Error('bad audio')
      return { text: '幫我 pause', tSpeechStart: 123 }
    }
  })
  expect(report.groups[0]).toMatchObject({
    cases: 3,
    evaluated: 2,
    skipped: 1,
    errors: 1,
    exactAccuracy: 0.5
  })
  expect(report.groups[3]?.exactAccuracy).toBe(1)
  expect(report.groups[1]?.exactAccuracy).toBeNull()
  expect(report.rows[0]?.predicted).toBe('pause')
  expect(markdownReport(report)).toContain('N/A')
})
it('distinguishes correct intent from wrong slots', async () => {
  const cases = readCasesCsv(
    'id,utterance,expected intent,slots,lang\na,go to B2,go-to,"{""range"":""A1""}",en\n'
  )
  const report = await evaluateCases(cases, { mode: 'text' })
  expect(report.groups[0]).toMatchObject({ intentAccuracy: 1, exactAccuracy: 0 })
})
it('rejects malformed CSV, unknown intents, invalid slots, duplicate ids and missing columns', () => {
  for (const text of [
    'id,utterance\nx,click',
    'id,utterance,expected intent,slots,lang\nx,click,bad,{},en',
    'id,utterance,expected intent,slots,lang\nx,click,click,[],en',
    'id,utterance,expected intent,slots,lang\nx,click,click,{},en\nx,pause,pause,{},en',
    'id,utterance,expected intent,slots,lang,pending\nx,confirm,confirm,{},en,yes',
    'id,utterance,expected intent,slots,lang\nx,go to A0,go-to,"{""range"":""A0""}",en'
  ])
    expect(() => readCasesCsv(text)).toThrow()
})
it('preserves commas, quotes and embedded symbols across CSV and JSON slot parsing', async () => {
  const request = 'IF(A1>2, "是", "否") + $B$2'
  const fields = [
    'quoted',
    `formula for ${request}`,
    'formula-request',
    JSON.stringify({ request }),
    'mixed'
  ]
  const line = fields.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')
  const cases = readCasesCsv(`\uFEFFid,utterance,expected_intent,slots,lang\n${line}\n`)
  expect(cases[0]?.slots).toEqual({ request })
  expect((await evaluateCases(cases, { mode: 'text' })).groups[0]?.exactAccuracy).toBe(1)
})
