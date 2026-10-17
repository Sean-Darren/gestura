import { FormulaLoopStateSchema, PlainTextResponseSchema, reviewTextPages } from '@gestura/core'
import type {
  FormulaLoopState,
  FocusedText,
  PlainTextRequest,
  PlainTextResponse,
  ConfirmationEvidence,
  TextRegister
} from '@gestura/core'
import type { ActionGate } from '../action-gate'
import type { NativeBridge } from '../native'
import type { PauseController } from '../pause'
const initial = (): FormulaLoopState =>
  FormulaLoopStateSchema.parse({
    targetKind: 'plain-text',
    register: 'standard_written',
    phase: 'idle',
    proposalId: null,
    formula: '',
    explanation: '',
    target: 'Selected text field',
    references: [],
    correction: 0,
    lang: 'en',
    previous: '',
    canUndo: false,
    bounds: null,
    reviewText: '',
    reviewKind: 'formula',
    reviewPage: 0,
    reviewPages: 1
  })
export class PlainTextController {
  private view = initial()
  private snapshot: FocusedText | undefined
  private operation: PlainTextRequest['operation'] = 'rewrite'
  private instruction = ''
  private register: TextRegister = 'standard_written'
  private inserted = ''
  private revision = 0
  private created = 0
  private shown = false
  private writing = false
  private abort: AbortController | undefined
  private job: Promise<void> = Promise.resolve()
  private readonly unsubscribe: () => void
  constructor(
    private readonly options: {
      gate: ActionGate
      bridge: NativeBridge
      pause: PauseController
      now(): number
      display(): { width: number; height: number }
      publish(): void
      generate(request: PlainTextRequest, signal: AbortSignal): Promise<PlainTextResponse>
    }
  ) {
    this.unsubscribe = options.pause.subscribe((paused) => {
      if (paused) this.cancel('Input paused. Text proposal cancelled.')
    })
  }
  get active(): boolean {
    return !['idle', 'cancelled', 'error'].includes(this.view.phase)
  }
  get confirmable(): boolean {
    return ['proposed', 'undo-proposed'].includes(this.view.phase)
  }
  get isShown(): boolean {
    return this.shown
  }
  get isWriting(): boolean {
    return this.writing
  }
  private pages(): { text: string; kind: 'formula' | 'explanation' }[] {
    const width = this.view.bounds?.width ?? 600
    const lines = (this.view.bounds?.height ?? 532) < 460 ? 1 : 3
    return [
      ...reviewTextPages(this.view.formula, width * 0.75, lines).map((text) => ({
        text,
        kind: 'formula' as const
      })),
      ...reviewTextPages(this.view.explanation, width, lines).map((text) => ({
        text,
        kind: 'explanation' as const
      }))
    ]
  }
  get state(): FormulaLoopState {
    const pages = this.pages()
    this.view.reviewPage = Math.min(this.view.reviewPage, pages.length - 1)
    return {
      ...this.view,
      reviewText: pages[this.view.reviewPage]!.text,
      reviewKind: pages[this.view.reviewPage]!.kind,
      reviewPages: pages.length
    }
  }
  private emit(): void {
    this.options.publish()
  }
  private invalidate(): void {
    this.revision++
    this.abort?.abort()
    this.abort = undefined
    if (this.view.proposalId) this.options.gate.cancel(this.view.proposalId)
    this.view.proposalId = null
    this.shown = false
  }
  cancel(message = 'Text proposal cancelled.'): void {
    this.invalidate()
    this.inserted = ''
    this.view = { ...this.view, phase: 'cancelled', explanation: message, canUndo: false }
    this.emit()
  }
  request(
    operation: PlainTextRequest['operation'],
    instruction = '',
    lang: FormulaLoopState['lang'] = 'en'
  ): void {
    if (this.writing || this.options.pause.paused) return
    this.operation = operation
    this.start(instruction, lang)
  }
  start(instruction: string, lang: FormulaLoopState['lang'] = 'en', correction = false): void {
    if (this.writing || this.options.pause.paused) return
    if (!correction) {
      this.snapshot = undefined
      this.register = 'standard_written'
      this.inserted = ''
    }
    this.instruction = instruction
    this.view.lang = lang
    this.launch(correction, correction)
  }
  toggleRegister(): void {
    if (
      !['proposed', 'clarification'].includes(this.view.phase) ||
      this.options.pause.paused ||
      this.writing
    )
      return
    this.register =
      this.register === 'standard_written' ? 'colloquial_cantonese' : 'standard_written'
    this.launch(true, false)
  }
  private launch(retain: boolean, correction: boolean): void {
    const previous = this.view
    this.invalidate()
    const display = this.options.display()
    this.view = {
      ...initial(),
      lang: previous.lang,
      register: this.register,
      phase: retain ? 'correcting' : 'thinking',
      correction: retain ? previous.correction + Number(correction) : 0,
      explanation: 'Preparing text from your selection…',
      bounds: {
        x: 12,
        y: 84,
        width: Math.max(280, Math.min(600, display.width - 24)),
        height: Math.max(280, Math.min(532, display.height - 104))
      }
    }
    const revision = this.revision,
      abort = new AbortController()
    this.abort = abort
    this.emit()
    this.job = this.run(revision, abort.signal).catch(() => {
      if (this.current(revision))
        this.cancel(
          'Text unavailable. Check the provider and a focused editable, non-password field. Select text for rewriting/translation, then retry.'
        )
    })
  }
  private current(revision: number): boolean {
    return revision === this.revision && !this.options.pause.paused
  }
  private async run(revision: number, signal: AbortSignal): Promise<void> {
    const snapshot = this.snapshot ?? (await this.options.bridge.captureFocusedText())
    if (!this.current(revision)) return
    if (!snapshot || !(await this.options.bridge.checkFocusedText(snapshot.token)))
      throw Error('No focused selection')
    if (!this.current(revision)) return
    this.snapshot = snapshot
    const response = PlainTextResponseSchema.parse(
      await this.options.generate(
        {
          operation: this.operation,
          instruction: this.instruction,
          selectedText: snapshot.selectedText,
          register: this.register
        },
        signal
      )
    )
    if (!this.current(revision)) return
    if (
      response.register !== this.register ||
      !(await this.options.bridge.checkFocusedText(snapshot.token))
    )
      throw Error('Field changed')
    if (!this.current(revision)) return
    this.view.explanation = response.explanation
    if (response.status !== 'ok') {
      this.view.phase = response.status === 'needs_clarification' ? 'clarification' : 'error'
      this.emit()
      return
    }
    this.view.formula = response.text
    this.view.reviewPage = 0
    this.view.phase = 'proposed'
    this.view.proposalId = this.options.gate.propose({
      kind: 'plain-text',
      content: { text: response.text, fieldToken: snapshot.token }
    })
    this.created = this.options.now()
    this.emit()
  }
  present(id: string): void {
    if (
      id === this.view.proposalId &&
      this.view.reviewPage === this.pages().length - 1 &&
      !this.shown
    )
      this.shown = this.options.gate.markShown(id)
  }
  review(delta: number): void {
    const next = Math.max(0, Math.min(this.pages().length - 1, this.view.reviewPage + delta))
    if (next !== this.view.reviewPage) {
      this.view.reviewPage = next
      this.shown = false
      this.emit()
    }
  }
  async confirm(evidence: ConfirmationEvidence, id = this.view.proposalId): Promise<void> {
    if (
      !id ||
      id !== this.view.proposalId ||
      !this.confirmable ||
      !this.shown ||
      this.writing ||
      this.options.pause.paused
    )
      return
    const revision = this.revision,
      undo = this.view.phase === 'undo-proposed'
    this.writing = true
    try {
      const action = this.options.gate.confirm(id, evidence)
      if (!action) return
      const text = this.view.formula
      this.view.proposalId = null
      this.shown = false
      this.view.phase = undo ? 'restoring' : 'writing'
      this.emit()
      const ok = await this.options.bridge.typeText(text, action)
      if (!this.current(revision)) return
      this.inserted = ok && !undo ? text : ''
      this.view.phase = ok ? (undo ? 'idle' : 'written') : 'error'
      this.view.canUndo = ok && !undo
      this.view.explanation = ok
        ? undo
          ? 'Previous selection restored.'
          : 'Text inserted. Undo that opens a fresh confirmation.'
        : 'Insertion stopped or field changed. Some text may have been inserted; inspect the field before retrying.'
    } catch {
      if (this.current(revision)) {
        this.view.phase = 'error'
        this.view.canUndo = false
        this.view.explanation = 'Insertion outcome unavailable. Check the field before retrying.'
      }
    } finally {
      this.writing = false
      this.emit()
    }
  }
  async undo(evidence?: ConfirmationEvidence): Promise<void> {
    void evidence
    if (
      !this.snapshot ||
      !this.inserted ||
      !this.view.canUndo ||
      this.writing ||
      this.options.pause.paused
    )
      return
    this.invalidate()
    const revision = this.revision
    if (!(await this.options.bridge.checkFocusedText(this.snapshot.token, this.inserted, true))) {
      this.cancel('Undo unavailable: the field or inserted range changed.')
      return
    }
    if (!this.current(revision)) return
    this.view = {
      ...this.view,
      phase: 'undo-proposed',
      canUndo: false,
      reviewPage: 0,
      formula: this.snapshot.selectedText,
      explanation: this.snapshot.selectedText
        ? 'Restore the original selected text. Review, then confirm.'
        : 'Remove only the recorded inserted text. Review, then confirm.',
      proposalId: this.options.gate.propose({
        kind: 'plain-text-restore',
        content: {
          text: this.snapshot.selectedText,
          fieldToken: this.snapshot.token,
          insertedText: this.inserted
        }
      })
    }
    this.created = this.options.now()
    this.emit()
  }
  tick(): void {
    if (this.view.proposalId && this.options.now() - this.created >= 60000)
      this.cancel('Text proposal expired.')
  }
  settle(): Promise<void> {
    return this.job
  }
  dispose(): void {
    this.cancel()
    this.unsubscribe()
  }
}
