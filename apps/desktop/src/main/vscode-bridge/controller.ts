import { FormulaLoopStateSchema, reviewTextPages, CodeResponseSchema } from '@gestura/core'
import type {
  FormulaLoopState,
  CodeSnapshot,
  CodeRequest,
  CodeResponse,
  ConfirmationEvidence,
  ForegroundApp
} from '@gestura/core'
import type { ActionGate } from '../action-gate'
import type { PauseController } from '../pause'
import type { CodeBridge, PreparedCode } from './bridge'
const initial = (): FormulaLoopState =>
  FormulaLoopStateSchema.parse({
    phase: 'idle',
    proposalId: null,
    formula: '',
    explanation: '',
    target: '',
    references: [],
    correction: 0,
    lang: 'en',
    previous: '',
    canUndo: false,
    bounds: null,
    reviewText: '',
    reviewKind: 'formula',
    reviewPage: 0,
    reviewPages: 1,
    targetKind: 'code'
  })
export function isCodeApp(app: ForegroundApp | undefined): boolean {
  return (
    !!app &&
    /^(com\.microsoft\.vscode(?:insiders)?|code(?: - insiders)?(?:\.exe)?)$/i.test(app.appId)
  )
}
export class CodeController {
  private view = initial()
  private history: CodeRequest['history'] = []
  private snapshot: CodeSnapshot | undefined
  private prepared: PreparedCode | undefined
  private foreground: ForegroundApp | undefined
  private revision = 0
  private abort: AbortController | undefined
  private job: Promise<void> = Promise.resolve()
  private shown = false
  private writing = false
  private created = 0
  private readonly unsubscribe: () => void
  constructor(
    private readonly options: {
      gate: ActionGate
      bridge: CodeBridge
      pause: PauseController
      now(): number
      foreground(): Promise<ForegroundApp | undefined>
      display(): { width: number; height: number }
      generate(request: CodeRequest, signal: AbortSignal): Promise<CodeResponse>
      publish(): void
    }
  ) {
    this.unsubscribe = options.pause.subscribe((paused) => {
      if (paused) this.cancel('Input paused. Code proposal cancelled.')
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
    return [
      ...reviewTextPages(this.view.formula, width * 0.75).map((text) => ({
        text,
        kind: 'formula' as const
      })),
      ...reviewTextPages(this.view.explanation, width).map((text) => ({
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
      reviewPages: pages.length,
      reviewText: pages[this.view.reviewPage]!.text,
      reviewKind: pages[this.view.reviewPage]!.kind
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
  cancel(message = 'Code proposal cancelled.'): void {
    this.invalidate()
    this.options.bridge.cancel()
    this.prepared = undefined
    this.view = { ...this.view, phase: 'cancelled', explanation: message, canUndo: false }
    this.emit()
  }
  start(utterance: string, lang: FormulaLoopState['lang'] = 'en', correction = false): void {
    if (this.writing || this.options.pause.paused || !utterance.trim()) return
    const previous = this.view
    this.invalidate()
    this.options.bridge.cancel()
    if (!correction) {
      this.history = []
      this.snapshot = undefined
      this.foreground = undefined
    }
    this.prepared = undefined
    const display = this.options.display()
    this.view = {
      ...initial(),
      lang,
      phase: correction ? 'correcting' : 'thinking',
      correction: correction ? previous.correction + 1 : 0,
      explanation: lang === 'en' ? 'Preparing a code proposal…' : '正在準備程式碼建議…',
      bounds: {
        x: 12,
        y: 84,
        width: Math.max(280, Math.min(600, display.width - 24)),
        height: Math.max(280, Math.min(460, display.height - 104))
      }
    }
    const revision = this.revision,
      abort = new AbortController()
    this.abort = abort
    this.emit()
    this.job = this.run(utterance, revision, abort.signal).catch(() => {
      if (this.current(revision))
        this.cancel(
          'Code proposal unavailable. Check VS Code pairing, document changes and your provider, then retry.'
        )
    })
  }
  private current(revision: number): boolean {
    return revision === this.revision && !this.options.pause.paused
  }
  private async run(utterance: string, revision: number, signal: AbortSignal): Promise<void> {
    const snapshot = this.snapshot ?? (await this.options.bridge.getContext())
    if (!this.current(revision)) return
    const foreground = this.foreground ?? (await this.options.foreground())
    if (!this.current(revision)) return
    if (!snapshot || !isCodeApp(foreground)) throw Error('VS Code unavailable')
    this.snapshot = snapshot
    this.foreground = foreground
    const response = CodeResponseSchema.parse(
      await this.options.generate(
        {
          utterance,
          lang: this.view.lang,
          context: snapshot.context,
          history: this.history.slice(-20)
        },
        signal
      )
    )
    if (!this.current(revision)) return
    this.history.push(
      { role: 'user', content: utterance },
      { role: 'assistant', content: response.code }
    )
    this.history = this.history.slice(-20)
    this.view.explanation = response.explanation[this.view.lang === 'en' ? 'en' : 'zh_hk']
    if (response.status !== 'ok') {
      this.view.phase = response.status === 'needs_clarification' ? 'clarification' : 'error'
      this.emit()
      return
    }
    const prepared = await this.options.bridge.prepare(snapshot, response)
    if (!this.current(revision)) return
    if (!prepared) throw Error('Preview unavailable')
    this.foreground = await this.options.foreground()
    if (!this.current(revision)) return
    if (!isCodeApp(this.foreground)) throw Error('Destination changed')
    this.prepared = prepared
    this.view = {
      ...this.view,
      phase: 'proposed',
      formula: response.code,
      target: snapshot.context.fileName,
      proposalId: this.options.gate.propose({ kind: 'code', content: prepared }),
      reviewPage: 0
    }
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
    const undo = this.view.phase === 'undo-proposed',
      revision = this.revision
    this.writing = true
    try {
      const foreground = await this.options.foreground()
      if (!this.current(revision)) return
      if (!isCodeApp(foreground) || foreground?.appId !== this.foreground?.appId) {
        this.cancel('Destination changed. Request a fresh code proposal.')
        return
      }
      const action = this.options.gate.confirm(id, evidence)
      if (!action) return
      this.view.proposalId = null
      this.shown = false
      this.view.phase = undo ? 'restoring' : 'writing'
      this.emit()
      const ok = await this.options.bridge.write(action, undo)
      if (!this.current(revision)) return
      this.view.phase = ok ? (undo ? 'idle' : 'written') : 'error'
      this.view.canUndo = ok && !undo
      this.view.explanation = ok
        ? undo
          ? 'Previous code restored.'
          : 'Code inserted. Undo that opens a fresh confirmation.'
        : 'Edit outcome unavailable or document changed. Check VS Code before retrying.'
    } finally {
      this.writing = false
      this.emit()
    }
  }
  async undo(_evidence?: ConfirmationEvidence): Promise<void> {
    void _evidence
    if (!this.view.canUndo || !this.prepared || this.options.pause.paused || this.writing) return
    const previous = this.prepared
    this.invalidate()
    const revision = this.revision
    const code =
      previous.response.insertMode === 'replace_selection'
        ? previous.snapshot.context.selection
        : ''
    const response = { ...previous.response, status: 'unsupported' as const, code }
    const prepared = await this.options.bridge.prepare(previous.snapshot, response, true)
    if (!this.current(revision) || !prepared) {
      this.cancel('Cannot restore after document changes.')
      return
    }
    this.prepared = prepared
    this.view = {
      ...this.view,
      phase: 'undo-proposed',
      canUndo: false,
      formula: code,
      reviewPage: 0,
      explanation: 'Review the inverse edit in VS Code, then confirm to restore previous code.',
      proposalId: this.options.gate.propose({ kind: 'code-restore', content: prepared })
    }
    this.created = this.options.now()
    this.emit()
  }
  tick(): void {
    if (this.view.proposalId && this.options.now() - this.created >= 60000)
      this.cancel('Code proposal expired.')
  }
  settle(): Promise<void> {
    return this.job
  }
  dispose(): void {
    this.cancel()
    this.unsubscribe()
  }
}
