import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG } from '@gestura/core/config'
import { loadOpenRouterEnvironment, withOpenRouter } from './config'

const directories: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true })
})
it('enables only OpenRouter in memory with the selected default model', () => {
  const config = withOpenRouter(DEFAULT_CONFIG, { OPENROUTER_API_KEY: 'test-key' })
  expect(config.genai.cloudProvider).toEqual({
    apiKey: 'test-key',
    host: 'https://openrouter.ai/api',
    model: 'openai/gpt-4.1-mini'
  })
  expect(config.network.allowlist).toEqual(['openrouter.ai'])
  expect(DEFAULT_CONFIG.genai.cloudProvider).toBeUndefined()
  expect(config.excel.shareSampleValues).toBe(false)
})
it('does not enable cloud with an empty or absent key', () => {
  expect(withOpenRouter(DEFAULT_CONFIG, {})).toBe(DEFAULT_CONFIG)
  expect(withOpenRouter(DEFAULT_CONFIG, { OPENROUTER_API_KEY: '  ' })).toBe(DEFAULT_CONFIG)
})
it('rejects invalid settings without including secrets in the error', () => {
  expect(() => withOpenRouter(DEFAULT_CONFIG, { OPENROUTER_API_KEY: 'secret\nvalue' })).toThrow(
    'Invalid OpenRouter environment settings'
  )
})
it('reads quoted env syntax without exporting secrets and gives process env precedence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gestura-env-'))
  directories.push(directory)
  const path = join(directory, '.env')
  writeFileSync(path, 'OPENROUTER_API_KEY="file-key"\nOPENROUTER_MODEL=openai/gpt-4.1-mini\n')
  vi.stubEnv('OPENROUTER_API_KEY', undefined)
  vi.stubEnv('OPENROUTER_MODEL', undefined)
  expect(loadOpenRouterEnvironment(path).OPENROUTER_API_KEY).toBe('file-key')
  expect(process.env.OPENROUTER_API_KEY).toBeUndefined()
  vi.stubEnv('OPENROUTER_API_KEY', 'environment-key')
  expect(loadOpenRouterEnvironment(path).OPENROUTER_API_KEY).toBe('environment-key')
  expect(process.env.OPENROUTER_API_KEY).toBeUndefined()
})
