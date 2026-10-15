import { z } from 'zod'
export const SnapBoundsSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive()
  })
  .strict()
export type SnapBounds = z.infer<typeof SnapBoundsSchema>
export const SnapPreferencesSchema = z
  .object({
    version: z.literal(1),
    apps: z
      .record(z.string().min(1).max(512), z.boolean())
      .refine((v) => Object.keys(v).length <= 128)
  })
  .strict()
export type SnapPreferences = z.infer<typeof SnapPreferencesSchema>
export const SnapControlSchema = z
  .object({ appId: z.string().min(1).max(512), enabled: z.boolean() })
  .strict()
export const SnapSettingsSchema = z
  .object({
    foreground: z.string().max(512).nullable(),
    apps: z
      .array(
        z
          .object({
            appId: z.string().min(1).max(512),
            enabled: z.boolean(),
            blocked: z.boolean(),
            reason: z.string().max(500)
          })
          .strict()
      )
      .max(128),
    message: z.string().max(500)
  })
  .strict()
export type SnapSettings = z.infer<typeof SnapSettingsSchema>
export const PoorCoverageSchema = z
  .array(
    z
      .object({
        os: z.enum(['darwin', 'win32']),
        appId: z.string().min(1).max(512),
        reason: z.string().min(1).max(500)
      })
      .strict()
  )
  .max(128)
export type PoorCoverage = z.infer<typeof PoorCoverageSchema>
