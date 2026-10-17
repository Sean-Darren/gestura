import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import {
  OpenRouterEnvironmentSchema,
  GenaiCloudProviderConfigSchema,
  NetworkConfigSchema
} from '@gestura/core/config'
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

/** Read development secrets without adding them to child-process environments. */
export function loadOpenRouterEnvironment(path?: string): Record<string, string | undefined> {
  let file: Record<string, string | undefined> = {}
  if (path) {
    try {
      file = parseEnv(readFileSync(path, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('Unable to read local OpenRouter environment file')
    }
  }
  const result = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? file.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL ?? file.OPENROUTER_MODEL
  }
  delete process.env.OPENROUTER_API_KEY
  delete process.env.OPENROUTER_MODEL
  return result
}

export function withOpenRouter(
  config: AppConfig,
  environment: Record<string, string | undefined>
): AppConfig {
  const parsed = OpenRouterEnvironmentSchema.safeParse(environment)
  if (!parsed.success) throw new Error('Invalid OpenRouter environment settings')
  const { OPENROUTER_API_KEY: apiKey, OPENROUTER_MODEL: model } = parsed.data
  if (!apiKey) return config
  return {
    ...config,
    network: NetworkConfigSchema.parse({
      allowlist: [...new Set([...config.network.allowlist, 'openrouter.ai'])]
    }),
    genai: {
      ...config.genai,
      cloudProvider: GenaiCloudProviderConfigSchema.parse({
        host: 'https://openrouter.ai/api',
        apiKey,
        model
      })
    }
  }
}
