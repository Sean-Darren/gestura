import type { Provider, GenerateRequest, GenerateResponse } from '../index'

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
    this.host = options.host
    this.apiKey = options.apiKey
    this.model = options.model
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.perf = options.performance ?? globalThis.performance
  }

  private chatCompletionsUrl(): string {
    const base = (this.host.includes('://') ? this.host : `https://${this.host}`).replace(
      /\/+$/,
      ''
    )
    if (base.endsWith('/v1')) return `${base}/chat/completions`
    return `${base}/v1/chat/completions`
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const start = this.perf.now()
    try {
      const body = JSON.stringify({
        model: this.model,
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

      const response = await this.fetchImpl(this.chatCompletionsUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body,
        signal: request.signal ?? null
      })

      if (!response.ok) {
        throw new Error(
          `Cloud provider returned ${response.status}: ${await response.text().catch(() => '')}`
        )
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>
      }
      const content = data.choices?.[0]?.message?.content
      if (!content) throw new Error('Cloud provider returned empty response')

      const parsed = JSON.parse(content) as unknown
      return {
        json: parsed,
        provider: 'cloud',
        durationMs: this.perf.now() - start
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      throw err
    }
  }
}
