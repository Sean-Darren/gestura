import { z } from 'zod'
import { ExcelCellSchema } from './excel'
const ScalarSchema = z.union([z.string().max(32767), z.number().finite(), z.boolean(), z.null()])
const GridSchema = z.array(z.array(ScalarSchema).min(1).max(50)).min(1).max(100)
const OutputCellSchema = ExcelCellSchema.refine((cell) => {
  const parts = /^([A-Z]+)(\d+)$/.exec(cell)
  if (!parts) return false
  const col = [...parts[1]!].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)
  return col <= 52 && Number(parts[2]) <= 101
}, 'Output cell must be within A1:AZ101')
const SheetSchema = z
  .object({
    name: z
      .string()
      .regex(/^[\p{L}\p{N}_ ]{1,31}$/u)
      .default('Sheet1'),
    grid: GridSchema,
    targetCell: OutputCellSchema.default('AZ1')
  })
  .strict()
export const FormulaBenchCaseSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    sheet: z.union([
      SheetSchema,
      GridSchema.transform((grid) => ({ name: 'Sheet1', grid, targetCell: 'AZ1' }))
    ]),
    utterance: z.string().trim().min(1).max(2000),
    lang: z.enum(['en', 'yue', 'mixed']),
    correctionUtterance: z.string().trim().min(1).max(2000).optional(),
    category: z
      .enum(['aggregation', 'lookup', 'logical', 'date', 'text', 'uncategorized'])
      .default('uncategorized'),
    expected: z.union([
      z.object({ value: ScalarSchema }).strict(),
      z
        .object({ acceptedFormulas: z.array(z.string().startsWith('=').max(16000)).min(1).max(20) })
        .strict()
    ]),
    audioFile: z.string().min(1).max(500).optional(),
    correctionAudioFile: z.string().min(1).max(500).optional()
  })
  .strict()
export const FormulaBenchCasesSchema = z
  .array(FormulaBenchCaseSchema)
  .min(1)
  .max(1000)
  .superRefine((cases, ctx) => {
    const ids = new Set<string>()
    cases.forEach((c, i) => {
      if (ids.has(c.id))
        ctx.addIssue({ code: 'custom', path: [i, 'id'], message: 'Duplicate case id' })
      ids.add(c.id)
    })
  })
const RateSchema = z
  .object({
    inputPerMillion: z.number().finite().nonnegative(),
    outputPerMillion: z.number().finite().nonnegative(),
    model: z.string().min(1)
  })
  .strict()
export const FormulaBenchConfigSchema = z
  .object({
    shareSamples: z.boolean().default(false),
    absoluteTolerance: z.number().finite().nonnegative().default(1e-9),
    relativeTolerance: z.number().finite().nonnegative().default(1e-9),
    timeoutMs: z.number().int().min(100).max(300000).default(30000),
    pricing: z
      .object({
        currency: z.literal('USD'),
        asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        cloud: RateSchema.optional(),
        local: RateSchema.optional()
      })
      .strict()
      .optional()
  })
  .strict()
export type FormulaBenchCase = z.infer<typeof FormulaBenchCaseSchema>
export type FormulaBenchConfig = z.infer<typeof FormulaBenchConfigSchema>
