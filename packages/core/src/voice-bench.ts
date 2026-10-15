import { z } from 'zod'
import { IntentIdSchema, IntentSchema } from './intent'
export const VoiceCaseSchema = z
  .object({
    id: z.string().min(1).max(100),
    utterance: z.string().min(1).max(16000),
    expectedIntent: z.union([IntentIdSchema, z.literal('suggestions')]),
    slots: z.record(z.string(), z.string().max(16000)),
    lang: z.enum(['en', 'yue', 'mixed']),
    context: z.enum(['excel', 'other']).default('other'),
    pending: z.boolean().default(false),
    audio: z.string().min(1).max(512).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.expectedIntent === 'suggestions') {
      if (Object.keys(value.slots).length)
        ctx.addIssue({ code: 'custom', message: 'Suggestions have no expected slots' })
    } else if (!IntentSchema.safeParse({ id: value.expectedIntent, slots: value.slots }).success)
      ctx.addIssue({ code: 'custom', message: 'Expected slots do not match the intent schema' })
  })
export type VoiceCase = z.infer<typeof VoiceCaseSchema>
