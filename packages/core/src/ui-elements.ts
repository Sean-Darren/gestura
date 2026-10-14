import { z } from 'zod'

export const UiRoleSchema = z.enum([
  'button',
  'link',
  'menu-item',
  'tab',
  'list-item',
  'check-box',
  'edit-field',
  'spreadsheet-cell'
])
export type UiRole = z.infer<typeof UiRoleSchema>
const coordinate = z.number().finite().min(-2_147_483_648).max(2_147_483_647)
export const UiPointArgsSchema = z.tuple([coordinate, coordinate])
export const UiNearArgsSchema = z.tuple([
  coordinate,
  coordinate,
  z.number().finite().min(0).max(10_000)
])
export const UiElementSchema = z
  .object({
    bounds: z
      .object({
        x: coordinate,
        y: coordinate,
        width: z.number().finite().positive(),
        height: z.number().finite().positive()
      })
      .strict(),
    role: UiRoleSchema,
    name: z.string().max(4096),
    isEnabled: z.boolean(),
    isOffscreen: z.boolean(),
    isClickable: z.boolean()
  })
  .strict()
export type UiElement = z.infer<typeof UiElementSchema>
export const UiElementsSchema = z.array(UiElementSchema).max(50)
export const ForegroundAppSchema = z
  .object({ appId: z.string().max(4096), windowTitle: z.string().max(4096) })
  .strict()
export type ForegroundApp = z.infer<typeof ForegroundAppSchema>
