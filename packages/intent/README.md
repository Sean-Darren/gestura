# Pure intent matching

`commands.yaml` is the editable command catalogue. Run `pnpm intents:generate` after edits; the generated JSON is checked against YAML by the normal test suite. The runtime package reads only imported data, never a file or network resource.

```ts
import { IntentMatcher } from '@gestura/intent'
const matcher = new IntentMatcher()
matcher.match('揀 A1 到 A10', { app: 'excel' })
// match: go-to, slots { range: 'A1:A10' }
matcher.match('scrol down')
// fuzzy match with a similarity confidence
matcher.match('Count blank cells in this column', { app: 'excel' })
// genai-request: raw request text, with no provider call
```

Matches normalize NFKC width/case, punctuation, Chinese script, spoken numbers, letter aliases/NATO names, cells and ranges. Case-sensitive free request content is preserved; Chinese folding is for matching only. Excel references are bounded to XFD1048576. Fuzzy matching never repairs a cell value or guesses a free-text request. Confidence is a similarity score, not a calibrated probability. Default threshold 0.86; ambiguity margin 0.08. Both have schemas/defaults in core/config.

Outside Excel, low-confidence/ambiguous input returns up to three distinct structured suggestions. Those values support a later gaze UI; they do not execute. Confirmation/cancellation are excluded from fuzzy matching and all suggestions. Exact confirmation also requires pendingProposal=true and the real ASR tSpeechStart as the third argument. Missing timing cannot yield voice evidence. A caller must obtain that timestamp from the trusted speech transcript, never a renderer choice, CSV or gaze selection.

ActionGate remains the authority: trusted presentation code must call markShown(id) only after showing a proposal. Voice speech onset must be strictly later than the most recent display time and no later than the current epoch clock. Proposal expiry and ConfirmedAction.confirmedAt remain monotonic for the native bridge. No renderer endpoint for marking proposals shown or confirming them was added in P3.2. Live command dispatch, palette UI, dictation/undo and GenAI execution wiring belong to later steps.
