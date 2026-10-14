import { z } from 'zod'

const NetworkHostSchema = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      const url = new URL(`https://${value}`)
      return url.host === value && url.pathname === '/' && !url.search && !url.hash
    } catch {
      return false
    }
  }, 'Expected a host name, optionally with a port')

export const NetworkConfigSchema = z
  .object({ allowlist: z.array(NetworkHostSchema).default([]) })
  .strict()

export const LoggingConfigSchema = z.object({ enabled: z.boolean().default(false) }).strict()

export const AppConfigSchema = z
  .object({
    network: NetworkConfigSchema.default({ allowlist: [] }),
    logging: LoggingConfigSchema.default({ enabled: false })
  })
  .strict()

export type AppConfig = z.infer<typeof AppConfigSchema>

export const DEFAULT_CONFIG = AppConfigSchema.parse({})
