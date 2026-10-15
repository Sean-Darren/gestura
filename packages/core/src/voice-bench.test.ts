import { expect, it } from 'vitest'
import { VoiceCaseSchema } from './voice-bench'
it('validates benchmark labels/slots and defaults context without guessing language', () => {
  const input = { id: 'one', utterance: 'click', expectedIntent: 'click', slots: {}, lang: 'mixed' }
  expect(VoiceCaseSchema.parse(input)).toMatchObject({ context: 'other', pending: false })
  expect(VoiceCaseSchema.safeParse({ ...input, lang: 'unknown' }).success).toBe(false)
  expect(
    VoiceCaseSchema.safeParse({ ...input, expectedIntent: 'suggestions', slots: { range: 'B2' } })
      .success
  ).toBe(false)
  expect(VoiceCaseSchema.safeParse({ ...input, expectedIntent: 'go-to', slots: {} }).success).toBe(
    false
  )
})
