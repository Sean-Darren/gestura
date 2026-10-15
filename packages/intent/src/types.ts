import type { Intent, VoiceConfirmationEvidence } from '@gestura/core'
export type Suggestion = { intent: Intent; confidence: number; phrasing: string }
export type MatchResult =
  | {
      kind: 'match'
      intent: Intent
      confidence: number
      method: 'template' | 'fuzzy'
      evidence?: VoiceConfirmationEvidence
    }
  | {
      kind: 'genai-request'
      intent: Extract<Intent, { id: 'formula-request' }>
      confidence: number
    }
  | {
      kind: 'suggestions'
      suggestions: Suggestion[]
      reason:
        | 'below-threshold'
        | 'ambiguous'
        | 'pending-required'
        | 'voice-timing-required'
        | 'invalid-input'
    }
