import { z } from 'zod'
import { CellRangeSchema } from './intent'
export const ExcelSelectionSchema = z
  .string()
  .max(2000)
  .refine((v) => {
    const ranges = v.split(',')
    return ranges.length <= 100 && ranges.every((r) => CellRangeSchema.safeParse(r).success)
  }, 'Invalid selection ranges')

/**
 * Excel bridge message contracts (P4.1). These schemas are pure and shared:
 * `apps/desktop` main validates inbound events and the add-in (in
 * `integrations/excel-addin`) validates inbound commands with the same types.
 *
 * Main accepts only ActionGate confirmations for formula commits and restores.
 * prepareCell captures local content; selectRange changes selection without writing.
 * See `apps/desktop/src/main/excel-bridge` for the capability checks.
 */

/** Coarse per-column data type, inferred from non-empty sample values. */
export const ExcelColumnTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'date',
  'error',
  'empty',
  'mixed'
])
export type ExcelColumnType = z.infer<typeof ExcelColumnTypeSchema>

/** A column letter (A–ZZZ). Upper bound on column count is enforced by CellRangeSchema. */
const ColumnLetterSchema = z.string().regex(/^[A-Z]{1,3}$/)

export const ExcelColumnTypesSchema = z.record(ColumnLetterSchema, ExcelColumnTypeSchema)

/**
 * Up to 5 sample values for one column. Q15: these leave the device only when the
 * user's "share sample values" toggle is on — the caller gates inclusion.
 */
export const ExcelSampleSchema = z
  .object({
    column: ColumnLetterSchema,
    values: z.array(z.string().max(1000)).min(1).max(5)
  })
  .strict()
export type ExcelSample = z.infer<typeof ExcelSampleSchema>

export const ExcelCellSchema = CellRangeSchema.refine((v) => !v.includes(':'), 'One cell required')
export const ExcelCellContentSchema = z
  .object({
    formula: z.string().max(16000).nullable(),
    value: z.union([z.string().max(32767), z.number().finite(), z.boolean(), z.null()])
  })
  .strict()
export const ExcelSnapshotSchema = z
  .object({
    token: z.string().uuid(),
    sessionId: z.string().uuid(),
    sheetId: z.string().min(1).max(255),
    target: ExcelCellSchema,
    before: ExcelCellContentSchema
  })
  .strict()
export type ExcelSnapshot = z.infer<typeof ExcelSnapshotSchema>
export const RestoreCellActionSchema = z
  .object({
    kind: z.literal('excel-restore'),
    content: z
      .object({ snapshot: ExcelSnapshotSchema, expectedFormula: z.string().min(1).max(16000) })
      .strict()
  })
  .strict()

export const ExcelContextSchema = z
  .object({
    sheetName: z.string().max(255),
    sessionId: z.string().uuid().optional(),
    sheetId: z.string().min(1).max(255).optional(),
    selectionAddress: CellRangeSchema,
    activeCell: CellRangeSchema,
    headers: z.array(z.string().max(1024)).max(16384),
    columnTypes: ExcelColumnTypesSchema,
    usedRangeAddress: CellRangeSchema,
    samples: z.array(ExcelSampleSchema).max(16384).optional()
  })
  .strict()
export type ExcelContext = z.infer<typeof ExcelContextSchema>

/** The ActionGate proposal a confirmed formula write must carry. */
export const FormulaActionSchema = z
  .object({
    kind: z.literal('formula'),
    content: z
      .object({
        formula: z
          .string()
          .min(1)
          .max(16000)
          .refine((value) => !!value.trim()),
        target: CellRangeSchema,
        snapshot: ExcelSnapshotSchema.optional()
      })
      .strict()
  })
  .strict()
export type FormulaAction = z.infer<typeof FormulaActionSchema>

/** Server → add-in commands. The add-in is the only process with Office.js access. */
export const ExcelCommandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('prepareCell'),
      id: z.string().uuid(),
      target: ExcelCellSchema,
      sheetId: z.string().min(1).max(255),
      sessionId: z.string().uuid()
    })
    .strict(),
  z
    .object({
      type: z.literal('commitFormula'),
      id: z.string().uuid(),
      formula: z.string().min(1).max(16000),
      snapshot: ExcelSnapshotSchema
    })
    .strict(),
  z
    .object({
      type: z.literal('restoreCell'),
      id: z.string().uuid(),
      snapshot: ExcelSnapshotSchema,
      expectedFormula: z.string().min(1).max(16000)
    })
    .strict(),
  z
    .object({
      type: z.literal('getContext'),
      id: z.string().uuid(),
      includeSamples: z.boolean()
    })
    .strict(),
  z
    .object({
      type: z.literal('writeFormula'),
      id: z.string().uuid(),
      formula: z
        .string()
        .min(1)
        .max(16000)
        .refine((value) => !!value.trim()),
      target: CellRangeSchema
    })
    .strict(),
  z
    .object({
      type: z.literal('selectRange'),
      id: z.string().uuid(),
      address: ExcelSelectionSchema,
      sheetId: z.string().min(1).max(255).optional(),
      sessionId: z.string().uuid().optional()
    })
    .strict()
])
export type ExcelCommand = z.infer<typeof ExcelCommandSchema>

/** Add-in → server events. */
export const ExcelEventSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('prepared'), id: z.string().uuid(), snapshot: ExcelSnapshotSchema })
    .strict(),
  z.object({ type: z.literal('ready') }).strict(),
  z
    .object({ type: z.literal('context'), id: z.string().uuid(), context: ExcelContextSchema })
    .strict(),
  z.object({ type: z.literal('done'), id: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal('error'),
      id: z.string().uuid().optional(),
      message: z.string().max(500)
    })
    .strict()
])
export type ExcelEvent = z.infer<typeof ExcelEventSchema>

/** WebSocket endpoint path, appended to the loopback origin served by main. */
export const EXCEL_WS_PATH = '/gestura/excel'

/** Placeholder the server substitutes with the per-session pairing token when serving HTML. */
export const EXCEL_PAIRING_TOKEN_PLACEHOLDER = '%%GESTURA_PAIRING_TOKEN%%'

/** Global the taskpane reads to discover the pairing token. */
export const EXCEL_PAIRING_TOKEN_GLOBAL = '__GESTURA_PAIRING_TOKEN__'
