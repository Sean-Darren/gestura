import type { Provider, GenerateRequest, GenerateResponse } from '../index'

export interface LocalProviderOptions {
  host: string
  model: string
  fetch?: typeof globalThis.fetch
  performance?: typeof globalThis.performance
}

/**
 * Local Ollama provider (Q16). Used as a fallback for single-function formula
 * requests when the cloud provider is unavailable.
 */
export class LocalProvider implements Provider {
  readonly id = 'local'
  private readonly host: string
  private readonly model: string
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly perf: typeof globalThis.performance

  constructor(options: LocalProviderOptions) {
    this.host = options.host
    this.model = options.model
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.perf = options.performance ?? globalThis.performance
  }

  private chatUrl(): string {
    const base = (this.host.includes('://') ? this.host : `http://${this.host}`).replace(/\/+$/, '')
    return `${base}/api/chat`
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const start = this.perf.now()

    // Ollama supports structured output via the `format` parameter
    const body = JSON.stringify({
      model: this.model,
      messages: request.messages,
      format: request.jsonSchema,
      stream: false,
      options: {
        temperature: 0
      }
    })

    const response = await this.fetchImpl(this.chatUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: request.signal ?? null
    })

    if (!response.ok) {
      throw new Error(
        `Local provider returned ${response.status}: ${await response.text().catch(() => '')}`
      )
    }

    const data = (await response.json()) as { message?: { content?: string } }
    const content = data.message?.content
    if (!content) throw new Error('Local provider returned empty response')

    const parsed = JSON.parse(content) as unknown
    return {
      json: parsed,
      provider: 'local',
      durationMs: this.perf.now() - start
    }
  }
}
