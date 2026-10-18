import { FormulaResponseSchema } from '../index'
import type { FormulaRequest, FormulaResponse, Provider, GenerateRequest, Message } from '../index'
import { validateFormula } from '../index'
const PROMPT = `You are a spreadsheet formula assistant. Output valid JSON matching the schema.
The user works in sheet "{{sheetName}}". Used range: {{usedRangeAddress}}.
Selection: {{selectionAddress}}. Active cell: {{activeCell}}.
Headers: {{headers}}. Column types: {{columnTypes}}.
{{samples}}
Only use cell references within the used range. Never use blocked functions.
Respond in the user's language.`

export interface FormulaRouterOptions {
  /** Cloud provider (optional). When absent, only the local provider is used. */
  cloud?: Provider
  local: Provider
  timeoutMs?: number
  maxRetries?: number
  maxHistory?: number
  performance?: typeof globalThis.performance
}

/**
 * Cloud-first formula generation with 8s timeout → LocalProvider fallback
 * for single-function requests (Q16). When no cloud provider is configured,
 * routes directly to local.
 */
export class FormulaRouter {
  private readonly cloud: Provider | undefined
  private readonly local: Provider
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly maxHistory: number
  private readonly perf: typeof globalThis.performance

  constructor(options: FormulaRouterOptions) {
    this.cloud = options.cloud
    this.local = options.local
    this.timeoutMs = options.timeoutMs ?? 8000
    this.maxRetries = options.maxRetries ?? 1
    this.maxHistory = options.maxHistory ?? 20
    this.perf = options.performance ?? globalThis.performance
  }

  async generate(request: FormulaRequest): Promise<FormulaResponse> {
    const prompt = this.buildPrompt(request)
    const history = request.history.slice(-this.maxHistory)

    // Cloud-first if configured; otherwise go straight to local.
    if (this.cloud) {
      try {
        return await this.tryGenerate(this.cloud, prompt, history, request.utterance)
      } catch {
        // Cloud failed — only fall back for single-function requests (Q16)
        const isSingleFunctionRequest = this.looksLikeSingleFunction(request.utterance)
        if (!isSingleFunctionRequest) {
          return {
            status: 'unsupported',
            explanation:
              'Formula generation is unavailable right now. Check your network connection and try again.'
          }
        }
        try {
          return await this.tryGenerate(this.local, prompt, history, request.utterance)
        } catch {
          return {
            status: 'unsupported',
            explanation:
              'Formula generation failed with both cloud and local providers. Ensure Ollama is running or check your network.'
          }
        }
      }
    }

    // No cloud configured — use local directly
    try {
      return await this.tryGenerate(this.local, prompt, history, request.utterance)
    } catch {
      return {
        status: 'unsupported',
        explanation:
          'Formula generation failed. Ensure Ollama is running on the configured host or set up a cloud provider.'
      }
    }
  }

  private async tryGenerate(
    provider: Provider,
    prompt: string,
    history: FormulaRequest['history'],
    utterance: string
  ): Promise<FormulaResponse> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const messages: Message[] = [
        { role: 'system', content: prompt },
        ...history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
        { role: 'user', content: utterance }
      ]

      let lastError = ''
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        if (attempt > 0) {
          messages.push({
            role: 'user',
            content: `Validation error: ${lastError}. Please fix the formula.`
          })
        }

        const genRequest: GenerateRequest = {
          messages,
          jsonSchema: FormulaResponseSchema,
          signal: controller.signal
        }

        const result = await provider.generate(genRequest)
        const parsed = FormulaResponseSchema.safeParse(result.json)

        if (!parsed.success) {
          lastError = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
          continue
        }

        // Validate generated formula
        if (parsed.data.status === 'ok') {
          const validation = validateFormula(
            parsed.data.formula,
            '' // usedRange check requires context — caller handles this
          )
          if (!validation.valid) {
            lastError = validation.errors.join('; ')
            continue
          }
        }

        return parsed.data
      }

      return {
        status: 'unsupported',
        explanation: `Generated formula failed validation after ${this.maxRetries + 1} attempts.`
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  private buildPrompt(request: FormulaRequest): string {
    const prompt = PROMPT
    const ctx = request.context
    const samplesSection =
      ctx.samples && ctx.samples.length > 0
        ? `Sample values:\n${ctx.samples
            .map((s) => `  ${s.column}: ${s.values.join(', ')}`)
            .join('\n')}`
        : ''

    return prompt
      .replace('{{sheetName}}', ctx.sheetName)
      .replace('{{usedRangeAddress}}', ctx.usedRangeAddress)
      .replace('{{selectionAddress}}', ctx.selectionAddress)
      .replace('{{activeCell}}', ctx.activeCell)
      .replace('{{headers}}', ctx.headers.length ? ctx.headers.join(', ') : '(no headers detected)')
      .replace(
        '{{columnTypes}}',
        Object.entries(ctx.columnTypes)
          .map(([col, type]) => `${col}: ${type}`)
          .join(', ') || '(no columns)'
      )
      .replace('{{samples}}', samplesSection)
  }

  /** Heuristic: does the utterance describe a single function? */
  private looksLikeSingleFunction(utterance: string): boolean {
    const lower = utterance.toLowerCase()
    // Check for common single-function patterns
    const singleFunctionPatterns = [
      /\b(sum|average|count|max|min|if|vlookup|xlookup|hlookup|index|match|trim|upper|lower|proper|len|left|right|mid|concatenate|text|today|now|datedif|abs|round|roundup|rounddown|sqrt)\s*\(/i,
      /\b(sum|count|average|median|mode|stdev)\s*(of|the|all|everything)/i,
      /^(find|get|calculate|compute|show)\s+(the\s+)?(sum|average|total|count|maximum|minimum|max|min)/i,
      /^(sum|count|average|total|max|min)\s/i
    ]
    return singleFunctionPatterns.some((p) => p.test(lower))
  }
}
