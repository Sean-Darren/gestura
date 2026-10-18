import { tokenUsage } from '../index'
import type { Provider, GenerateRequest, GenerateResponse } from '../index'

export type CloudProviderFailure =
  | 'configuration'
  | 'authentication'
  | 'access'
  | 'rate-limit'
  | 'request'
  | 'timeout'
  | 'network'
  | 'response'

export class CloudProviderError extends Error {
  readonly name = 'CloudProviderError'
  constructor(readonly failure: CloudProviderFailure) {
    super('Cloud provider request failed')
  }
}

export interface CloudProviderOptions {
  host: string
  apiKey: string
  model: string
  /** Override for deterministic tests. */
  fetch?: typeof globalThis.fetch
  performance?: typeof globalThis.performance
}

/**
 * Provider-agnostic cloud LLM client (Q14). Sends structured JSON output
 * requests to the configured host. ApiKey is sent as a Bearer token.
 */
export class CloudProvider implements Provider {
  readonly id = 'cloud'
  private readonly host: string
  private readonly apiKey: string
  private readonly model: string
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly perf: typeof globalThis.performance

  constructor(options: CloudProviderOptions) {
    this.host = options.host.replace(/\/$/, '')
    this.apiKey = options.apiKey
    this.model = options.model
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.perf = options.performance ?? globalThis.performance
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const start = this.perf.now()
    try {
      const body = JSON.stringify({
        model: this.model,
        ...(new URL(this.host).origin === 'https://openrouter.ai'
          ? { provider: { require_parameters: true, data_collection: 'deny', zdr: true } }
          : {}),
        messages: request.messages,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'formula_response',
            schema: request.jsonSchema,
            strict: true
          }
        }
      })

      const response = await this.fetchImpl(`${this.host}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body,
        signal: request.signal ?? null
      })

      if (!response.ok) throw new CloudProviderError(failureForStatus(response.status))

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown }
      }
      const content = data.choices?.[0]?.message?.content
      if (!content) throw new CloudProviderError('response')

      const parsed = JSON.parse(content) as unknown
      const usage = tokenUsage(data.usage?.prompt_tokens, data.usage?.completion_tokens)
      return {
        json: parsed,
        provider: 'cloud',
        model: this.model,
        ...(usage ? { usage } : {}),
        durationMs: this.perf.now() - start
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError')
        throw new CloudProviderError('timeout')
      if (err instanceof CloudProviderError) throw err
      if (err instanceof SyntaxError) throw new CloudProviderError('response')
      if (err instanceof TypeError) throw new CloudProviderError('network')
      throw new CloudProviderError('request')
    }
  }
}

function failureForStatus(status: number): CloudProviderFailure {
  if (status === 401) return 'authentication'
  if (status === 403) return 'access'
  if (status === 429) return 'rate-limit'
  if (status >= 400 && status < 500) return 'request'
  return 'response'
}
