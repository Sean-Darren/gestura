import { readFileSync } from 'node:fs'
import { AppConfigSchema, DEFAULT_CONFIG, type AppConfig } from '@gestura/core/config'

/**
 * Read GenAI cloud-provider settings from environment variables.
 * Supported: OPENROUTER_API_KEY + OPENROUTER_MODEL → openrouter.ai
 */
export function readEnvFile(path: string | undefined): Record<string, string> {
  if (!path) return {}
  try {
    const text = readFileSync(path, 'utf8')
    const values: Record<string, string> = {}
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const separator = line.indexOf('=')
      if (separator <= 0) continue
      const key = line.slice(0, separator).trim()
      let value = line.slice(separator + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (key) values[key] = value
    }
    return values
  } catch {
    return {}
  }
}

type EnvCloudProvider = NonNullable<AppConfig['genai']['cloudProvider']> & {
  allowlistHost: string
}

function envCloudProvider(env: Record<string, string | undefined>): EnvCloudProvider | undefined {
  const key = env.OPENROUTER_API_KEY
  const model = env.OPENROUTER_MODEL
  if (!key || !model) return undefined
  const host = env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'
  const allowlistHost = (() => {
    try {
      return new URL(host).host
    } catch {
      return 'openrouter.ai'
    }
  })()
  return {
    apiKey: key,
    host,
    model,
    allowlistHost
  }
}

export function loadAppConfig(path: string, envPath?: string): AppConfig {
  const envFile = readEnvFile(envPath)
  const env: Record<string, string | undefined> = { ...process.env, ...envFile }
  const envOverride = envCloudProvider(env)
  const cloudProvider = envOverride
    ? {
        apiKey: envOverride.apiKey,
        host: envOverride.host,
        model: envOverride.model
      }
    : undefined
  const allowlistHost = envOverride?.allowlistHost
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
    const result = AppConfigSchema.safeParse(raw)
    const config = result.success ? result.data : DEFAULT_CONFIG
    if (cloudProvider) {
      config.genai.cloudProvider = cloudProvider
      // Ensure the cloud host is in the network allowlist so main-process
      // fetch calls can reach it.
      if (allowlistHost && !config.network.allowlist.includes(allowlistHost)) {
        config.network.allowlist = [...config.network.allowlist, allowlistHost]
      }
    }
    return config
  } catch {
    const config = { ...DEFAULT_CONFIG }
    if (cloudProvider) {
      config.genai.cloudProvider = cloudProvider
      config.network.allowlist = allowlistHost
        ? [...new Set([...config.network.allowlist, allowlistHost])]
        : config.network.allowlist
    }
    return config
  }
}
