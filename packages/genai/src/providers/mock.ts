import type { Provider, GenerateRequest, GenerateResponse } from '../index'

export interface MockProviderOptions {
  responses?: Record<string, unknown>
  latencyMs?: number
  /** If true, throw when no canned response exists (simulates network failure). */
  throwOnUnknown?: boolean
}

/**
 * Mock provider for unit tests and formula benchmarks. Returns canned
 * responses keyed by the first user message content.
 */
export class MockProvider implements Provider {
  readonly id = 'mock'
  private readonly responses: Map<string, unknown>
  private readonly latencyMs: number
  private readonly throwOnUnknown: boolean

  constructor(options: MockProviderOptions | Record<string, unknown> = {}) {
    // Backward compat: if passed a plain Record, treat as responses
    if (options && 'responses' in options) {
      const opts = options as MockProviderOptions
      this.responses = new Map(Object.entries(opts.responses ?? {}))
      this.latencyMs = opts.latencyMs ?? 0
      this.throwOnUnknown = opts.throwOnUnknown ?? false
    } else if ((options && 'throwOnUnknown' in options) || 'latencyMs' in options) {
      const opts = options as MockProviderOptions
      this.responses = new Map(Object.entries(opts.responses ?? {}))
      this.latencyMs = opts.latencyMs ?? 0
      this.throwOnUnknown = opts.throwOnUnknown ?? false
    } else {
      this.responses = new Map(Object.entries(options as Record<string, unknown>))
      this.latencyMs = 0
      this.throwOnUnknown = false
    }
  }

  set(key: string, response: unknown): this {
    this.responses.set(key, response)
    return this
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs))
    }

    const query = request.messages.find((m) => m.role === 'user')?.content ?? ''
    const json = this.responses.get(query)
    if (json === undefined) {
      if (this.throwOnUnknown) {
        throw new Error(`Mock: no response for "${query.slice(0, 80)}" and throwOnUnknown is set`)
      }
      return {
        json: {
          status: 'unsupported',
          explanation: `Mock: no canned response for "${query.slice(0, 80)}"`
        },
        provider: 'mock',
        durationMs: this.latencyMs
      }
    }

    return { json, provider: 'mock', durationMs: this.latencyMs }
  }
}
