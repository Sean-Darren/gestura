import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import {
  OpenRouterEnvironmentSchema,
  GenaiCloudProviderConfigSchema,
  NetworkConfigSchema
} from '@gestura/core/config'
import { AppConfigSchema, type AppConfig } from '@gestura/core/config'

export function readEnvFile(path: string | undefined): Record<string, string | undefined> {
  if (!path) return {}
  try {
    return parseEnv(readFileSync(path, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new Error('Unable to read local OpenRouter environment file')
    return {}
  }
}

export function loadAppConfig(path: string, envPath?: string): AppConfig {
  let config: AppConfig
  try {
    const contents: unknown = JSON.parse(readFileSync(path, 'utf8'))
    const result = AppConfigSchema.safeParse(contents)
    config = result.success ? result.data : AppConfigSchema.parse({})
  } catch {
    config = AppConfigSchema.parse({})
  }
  return envPath ? withOpenRouter(config, loadOpenRouterEnvironment(envPath)) : config
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
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL ?? file.OPENROUTER_MODEL,
    OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL ?? file.OPENROUTER_BASE_URL
  }
  delete process.env.OPENROUTER_API_KEY
  delete process.env.OPENROUTER_MODEL
  delete process.env.OPENROUTER_BASE_URL
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
  const provider = GenaiCloudProviderConfigSchema.parse({
    host: environment.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api',
    apiKey,
    model
  })
  const host = new URL(provider.host).host
  return {
    ...config,
    network: NetworkConfigSchema.parse({
      allowlist: [...new Set([...config.network.allowlist, host])]
    }),
    genai: {
      ...config.genai,
      cloudProvider: provider
    }
  }
}
