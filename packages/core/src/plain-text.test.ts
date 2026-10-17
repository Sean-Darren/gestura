import { expect, it } from 'vitest'
import { FocusedTextSchema, PlainTextRequestSchema, PlainTextResponseSchema } from './plain-text'
it('permits only selected text and rejects extra field/window data and oversized content', () => {
  const request = {
    operation: 'rewrite',
    instruction: '',
    selectedText: 'hello',
    register: 'standard_written'
  }
  expect(PlainTextRequestSchema.safeParse(request).success).toBe(true)
  for (const invalid of [
    { ...request, fieldValue: 'private' },
    { ...request, selectedText: '' },
    { ...request, selectedText: 'x'.repeat(10001) }
  ])
    expect(PlainTextRequestSchema.safeParse(invalid).success).toBe(false)
  expect(
    FocusedTextSchema.safeParse({
      token: crypto.randomUUID(),
      selectedText: '你好',
      windowTitle: 'private'
    }).success
  ).toBe(false)
})
it('requires a valid register, bounded output and nonempty successful text', () => {
  const response = {
    status: 'ok',
    text: '你好',
    register: 'colloquial_cantonese',
    explanation: '口語'
  }
  expect(PlainTextResponseSchema.safeParse(response).success).toBe(true)
  expect(PlainTextResponseSchema.safeParse({ ...response, text: '' }).success).toBe(false)
  expect(PlainTextResponseSchema.safeParse({ ...response, text: '\u001bcommand' }).success).toBe(
    false
  )
  expect(PlainTextResponseSchema.safeParse({ ...response, register: 'simplified' }).success).toBe(
    false
  )
})
