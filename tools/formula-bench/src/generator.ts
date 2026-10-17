import { FormulaRouter, FormulaResponseSchema } from '@gestura/genai'
import type { Provider } from '@gestura/genai'
import type { Generator, ProviderCall } from './evaluate'
/** Responses are authored separately; this factory never receives benchmark expected values. */
export function scriptedGenerator(responses: Record<string, unknown>): Generator {
  return async (request, signal) => {
    signal.throwIfAborted()
    if (!Object.hasOwn(responses, request.utterance)) throw Error('No scripted response')
    return {
      response: FormulaResponseSchema.parse(responses[request.utterance]),
      calls: [{ provider: 'mock', failed: false }]
    }
  }
}
export function routerGenerator(options: {
  cloud: Provider
  local: Provider
  timeoutMs: number
  maxRetries: number
  maxHistory: number
}): Generator {
  return async (request, signal) => {
    const calls: ProviderCall[] = []
    const wrap = (provider: Provider): Provider => ({
      id: provider.id,
      async generate(input) {
        const call: ProviderCall = { provider: provider.id, failed: true }
        calls.push(call)
        try {
          const result = await provider.generate(input)
          Object.assign(
            call,
            { failed: false },
            result.model ? { model: result.model } : {},
            result.usage ?? {}
          )
          return result
        } catch {
          throw Error('Provider request failed')
        }
      }
    })
    const router = new FormulaRouter({
      ...options,
      cloud: wrap(options.cloud),
      local: wrap(options.local)
    })
    try {
      return { response: await router.generate(request, signal), calls }
    } catch {
      return {
        response: { status: 'unsupported', explanation: 'Generation cancelled or failed' },
        calls
      }
    }
  }
}
