import { readFileSync } from 'node:fs'
import { AppConfigSchema, DEFAULT_CONFIG, type AppConfig } from '@gestura/core/config'

export function loadAppConfig(path: string): AppConfig {
  try {
    const contents: unknown = JSON.parse(readFileSync(path, 'utf8'))
    const result = AppConfigSchema.safeParse(contents)
    return result.success ? result.data : DEFAULT_CONFIG
  } catch {
    return DEFAULT_CONFIG
  }
}
