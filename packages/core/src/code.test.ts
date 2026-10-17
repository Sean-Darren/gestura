import { expect, it } from 'vitest'
import { CodeContextSchema, CodeResponseSchema, CodeCommandSchema, CodePairingSchema } from './code'
const context = {
  languageId: 'typescript',
  fileName: 'a.ts',
  selection: '',
  surroundingLines: ['const a = 1']
}
it('accepts bounded code context and rejects extra workspace data, paths and excess lines', () => {
  expect(CodeContextSchema.safeParse(context).success).toBe(true)
  for (const value of [
    { ...context, workspace: 'private' },
    { ...context, fileName: '/private/a.ts' },
    { ...context, surroundingLines: Array(41).fill('x') }
  ])
    expect(CodeContextSchema.safeParse(value).success).toBe(false)
})
it('requires bilingual explanations and a supported edit mode', () => {
  const response = {
    status: 'ok',
    code: '你好',
    insertMode: 'insert_at_cursor',
    explanation: { en: 'Insert text', zh_hk: '插入文字' }
  }
  expect(CodeResponseSchema.safeParse(response).success).toBe(true)
  expect(CodeResponseSchema.safeParse({ ...response, insertMode: 'run' }).success).toBe(false)
  expect(CodeResponseSchema.safeParse({ ...response, code: '' }).success).toBe(false)
  expect(
    CodeResponseSchema.safeParse({ ...response, explanation: { en: 'Only English' } }).success
  ).toBe(false)
})
it('rejects raw code in apply commands and malformed pairing secrets', () => {
  expect(
    CodeCommandSchema.safeParse({
      type: 'apply',
      id: crypto.randomUUID(),
      snapshot: crypto.randomUUID(),
      preview: crypto.randomUUID(),
      code: 'unsafe bypass'
    }).success
  ).toBe(false)
  expect(CodePairingSchema.safeParse({ port: 3511, token: 'x' }).success).toBe(false)
})
