import { expect, it } from 'vitest'
import {
  CellRangeSchema,
  CommandCatalogueSchema,
  IntentSchema,
  VoiceConfirmationEvidenceSchema
} from './intent'
import { IntentConfigSchema, DEFAULT_INTENT_CONFIG } from './config'
it('validates typed slots and Excel bounds without throwing inside safeParse', () => {
  for (const value of ['A1', 'XFD1048576', 'A1:A10'])
    expect(CellRangeSchema.safeParse(value).success).toBe(true)
  for (const value of ['bad', 'A0', 'XFE1', 'AAAA1', 'A1048577', 'A01'])
    expect(CellRangeSchema.safeParse(value).success).toBe(false)
  expect(IntentSchema.safeParse({ id: 'click', slots: { range: 'B2' } }).success).toBe(false)
  expect(IntentSchema.safeParse({ id: 'go-to', slots: {} }).success).toBe(false)
  expect(IntentSchema.safeParse({ id: 'formula-request', slots: { request: '' } }).success).toBe(
    false
  )
  expect(
    VoiceConfirmationEvidenceSchema.safeParse({ kind: 'voice-confirm', tSpeechStart: NaN }).success
  ).toBe(false)
  expect(DEFAULT_INTENT_CONFIG.fuzzyThreshold).toBe(0.86)
  expect(IntentConfigSchema.safeParse({ fuzzyThreshold: 0.2 }).success).toBe(false)
  expect(CommandCatalogueSchema.safeParse({ version: 1, commands: [] }).success).toBe(false)
})
