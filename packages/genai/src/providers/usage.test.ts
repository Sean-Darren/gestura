import { describe, expect, it, vi } from 'vitest'
import { CloudProvider } from './cloud'
import { LocalProvider } from './local'
import { tokenUsage } from '../index'
import { FORMULA_OUTPUT_JSON_SCHEMA } from '../formula/output-schema'
describe('provider usage metadata', () => {
  it('parses cloud usage and sends plain structured JSON Schema', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"status":"unsupported","explanation":"test"}' } }],
          usage: { prompt_tokens: 100, completion_tokens: 20 }
        })
      )
    )
    const provider = new CloudProvider({
      host: 'https://example.com',
      apiKey: 'test',
      model: 'model',
      fetch
    })
    const result = await provider.generate({ messages: [], jsonSchema: FORMULA_OUTPUT_JSON_SCHEMA })
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 20 })
    expect(result.model).toBe('model')
    const body = JSON.parse(String(fetch.mock.calls[0]![1]!.body)) as {
      response_format: { json_schema: { schema: object } }
    }
    expect(body.response_format.json_schema.schema).toMatchObject({
      type: 'object',
      additionalProperties: false
    })
    expect(JSON.stringify(body)).not.toContain('_def')
  })
  it('parses Ollama usage', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ message: { content: '{}' }, prompt_eval_count: 30, eval_count: 10 })
        )
      )
    const result = await new LocalProvider({
      host: 'http://127.0.0.1:11434',
      model: 'local',
      fetch
    }).generate({ messages: [], jsonSchema: { type: 'object' } })
    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 10 })
  })
  it('does not fabricate missing or invalid usage', () => {
    expect(tokenUsage(undefined, 1)).toBeUndefined()
    expect(tokenUsage(-1, 1)).toBeUndefined()
    expect(tokenUsage(0.5, 1)).toBeUndefined()
  })
})
