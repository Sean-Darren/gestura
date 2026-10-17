import { ExcelCellSchema, FormulaLoopStateSchema, reviewTextPages } from '@gestura/core'
import type {
  ConfirmationEvidence,
  ExcelContext,
  ExcelSnapshot,
  FormulaLoopState,
  ForegroundApp
} from '@gestura/core'
import {
  buildFormulaContext,
  FormulaRequestSchema,
  FormulaResponseSchema,
  validateFormula
} from '@gestura/genai'
import type { FormulaRequest, FormulaResponse } from '@gestura/genai'
import type { ExcelBridge } from '../excel-bridge'
import type { PauseController } from '../pause'
import { ActionGate } from '../action-gate'

type Bounds = { x: number; y: number; width: number; height: number }
export type FormulaBridge = Pick<
  ExcelBridge,
  'getContext' | 'prepareFormula' | 'writeFormula' | 'restoreCell' | 'highlight'
>
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
    reviewPages: 1
  })
export class FormulaController {
  private view = initial()
  private context: ExcelContext | undefined
  private snapshot: ExcelSnapshot | undefined
  private foreground: ForegroundApp | undefined
  private history: FormulaRequest['history'] = []
  private revision = 0
  private shown = false
  private created = 0
  private abort: AbortController | undefined
  private job: Promise<void> = Promise.resolve()
  private writing = false
  private readonly unsubscribe: () => void
  private disposed = false
  private reviewCache:
    | {
        formula: string
        explanation: string
        previous: string
        canUndo: boolean
        width: number
        pages: { text: string; kind: FormulaLoopState['reviewKind'] }[]
      }
    | undefined
  constructor(
    private readonly options: {
      gate: ActionGate
      bridge: FormulaBridge
      pause: PauseController
      now(): number
      foreground(): Promise<ForegroundApp | undefined>
      generate(request: FormulaRequest, signal: AbortSignal): Promise<FormulaResponse>
      display(): { width: number; height: number }
      anchor?(target: string): Bounds | undefined
      publish(): void
      shareSamples: boolean
    }
  ) {
    this.unsubscribe = options.pause.subscribe((paused) => {
      if (paused) this.cancel('Input paused. Formula proposal cancelled.')
    })
  }
  get active(): boolean {
    return !['idle', 'cancelled', 'error'].includes(this.view.phase)
  }
  get confirmable(): boolean {
    return this.view.phase === 'proposed' || this.view.phase === 'undo-proposed'
  }
  get isShown(): boolean {
    return this.shown
  }
  get isWriting(): boolean {
    return this.writing
  }
  get state(): FormulaLoopState {
    const pages = this.pages()
    this.view.reviewPages = pages.length
    this.view.reviewPage = Math.min(this.view.reviewPage, pages.length - 1)
    return {
      ...this.view,
      reviewText: pages[this.view.reviewPage]!.text,
      reviewKind: pages[this.view.reviewPage]!.kind
    }
  }
  private pages(): { text: string; kind: FormulaLoopState['reviewKind'] }[] {
    const width = this.view.bounds?.width ?? this.options.display().width
    const cached = this.reviewCache
    if (
      cached &&
      cached.width === width &&
      cached.formula === this.view.formula &&
      cached.explanation === this.view.explanation &&
      cached.previous === this.view.previous &&
      cached.canUndo === this.view.canUndo
    )
      return cached.pages
    const pages: { text: string; kind: FormulaLoopState['reviewKind'] }[] = [
      ...(this.view.formula ? reviewTextPages(this.view.formula, width * 0.75) : []).map(
        (text) => ({
          text,
          kind: 'formula' as const
        })
      ),
      ...reviewTextPages(this.view.explanation, width).map((text) => ({
        text,
        kind: 'explanation' as const
      }))
    ]
    if (this.view.canUndo)
      pages.push(
        ...reviewTextPages(this.view.previous, width).map((text) => ({
          text,
          kind: 'previous' as const
        }))
      )
    this.reviewCache = {
      formula: this.view.formula,
      explanation: this.view.explanation,
      previous: this.view.previous,
      canUndo: this.view.canUndo,
      width,
      pages
    }
    return pages
  }
  private emit(): void {
    if (!this.disposed) this.options.publish()
  }
  private invalidate(): void {
    this.revision++
    this.abort?.abort()
    this.abort = undefined
    if (this.view.proposalId) this.options.gate.cancel(this.view.proposalId)
    this.view.proposalId = null
    this.shown = false
  }
  cancel(message = 'Formula cancelled.'): void {
    this.invalidate()
    this.view = { ...this.view, phase: 'cancelled', explanation: message, canUndo: false }
    this.snapshot = undefined
    this.emit()
  }
  start(utterance: string, lang: FormulaLoopState['lang'] = 'en', correction = false): void {
    if (this.options.pause.paused || this.writing || !utterance.trim()) return
    const previous = this.view
    this.invalidate()
    if (!correction) {
      this.context = undefined
      this.foreground = undefined
      this.history = []
    }
    this.snapshot = undefined
    this.view = {
      ...initial(),
      phase: correction ? 'correcting' : 'thinking',
      lang,
      correction: correction ? previous.correction + 1 : 0,
      explanation: lang === 'en' ? 'Thinking about your formula…' : '正在準備公式…',
      bounds: this.place(previous.target),
      target: previous.target
    }
    const revision = this.revision
    const abort = new AbortController()
    this.abort = abort
    this.emit()
    this.job = this.run(utterance, revision, abort.signal).catch(() => {
      if (revision === this.revision) {
        this.view.phase = 'error'
        this.view.explanation =
          'Could not prepare this formula. Check the Excel connection and provider, then retry.'
        this.emit()
      }
    })
  }
  private current(revision: number): boolean {
    return revision === this.revision && !this.disposed && !this.options.pause.paused
  }
  private async run(utterance: string, revision: number, signal: AbortSignal): Promise<void> {
    const ctx = this.context ?? (await this.options.bridge.getContext())
    if (!this.current(revision)) return
    if (!ctx?.sessionId || !ctx.sheetId) throw Error('Update/reconnect the Excel add-in')
    const foreground = this.foreground ?? (await this.options.foreground())
    if (!this.current(revision)) return
    this.context = ctx
    this.foreground = foreground
    this.view.target = `${ctx.sheetName}!${ctx.activeCell}`
    this.view.bounds = this.place(ctx.activeCell)
    this.emit()
    const request = FormulaRequestSchema.parse({
      utterance,
      lang: this.view.lang,
      context: buildFormulaContext(ctx, this.options.shareSamples),
      history: this.history.slice(-48)
    })
    const result = FormulaResponseSchema.parse(await this.options.generate(request, signal))
    if (!this.current(revision)) return
    if (result.status !== 'ok') {
      this.history = [...this.history, { role: 'user', content: utterance }]
      this.view.phase = result.status === 'needs_clarification' ? 'clarification' : 'error'
      this.view.explanation =
        result.status === 'needs_clarification' ? result.clarificationQuestion : result.explanation
      this.emit()
      return
    }
    const formula = result.formula.trim()
    if (
      !validateFormula(formula, ctx.usedRangeAddress).valid ||
      !ExcelCellSchema.safeParse(result.targetCell).success
    )
      throw Error('Invalid formula')
    const snapshot = await this.options.bridge.prepareFormula(ctx, result.targetCell)
    if (!this.current(revision)) return
    if (!snapshot) throw Error('Could not capture the destination cell')
    this.snapshot = snapshot
    this.history = [
      ...this.history,
      { role: 'user', content: utterance },
      { role: 'assistant', content: formula }
    ]
    const columns = [
      ...new Set(
        result.references.map((ref) => ref.match(/^[A-Z]+/)?.[0]).filter((c): c is string => !!c)
      )
    ].slice(0, 100)
    const rows = ctx.usedRangeAddress.match(/\d+/g) ?? ['1', '1']
    const references = columns.map((col) => `${col}${rows[0]}:${col}${rows.at(-1)}`)
    const highlighted =
      !references.length || (await this.options.bridge.highlight(references.join(','), ctx))
    if (!this.current(revision)) return
    this.view = {
      ...this.view,
      phase: 'proposed',
      formula,
      target: `${ctx.sheetName}!${result.targetCell}`,
      references,
      explanation:
        result.explanation +
        (highlighted ? '' : ' (Column selection unavailable in this Excel version.)'),
      bounds: this.place(result.targetCell),
      reviewPage: 0,
      canUndo: false
    }
    this.created = this.options.now()
    this.view.proposalId = this.options.gate.propose({
      kind: 'formula',
      content: { formula, target: snapshot.target, snapshot }
    })
    this.shown = false
    this.emit()
  }
  private place(target: string): Bounds {
    const display = this.options.display(),
      width = Math.max(280, Math.min(600, display.width - 24)),
      height = Math.min(460, display.height - 104)
    const anchor = this.options.anchor?.(target)
    return {
      x: Math.max(
        12,
        Math.min(display.width - width - 12, anchor ? anchor.x + anchor.width + 12 : 12)
      ),
      y: Math.max(84, Math.min(display.height - height - 12, anchor?.y ?? 84)),
      width,
      height: Math.max(280, height)
    }
  }
  present(id: string): void {
    if (
      id !== this.view.proposalId ||
      this.view.reviewPage !== this.pages().length - 1 ||
      this.shown
    )
      return
    this.shown = this.options.gate.markShown(id)
  }
  review(delta: number): void {
    const next = Math.max(0, Math.min(this.pages().length - 1, this.view.reviewPage + delta))
    if (next === this.view.reviewPage) return
    this.view.reviewPage = next
    this.shown = false
    this.emit()
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
    await this.mutate(evidence, this.view.phase === 'undo-proposed')
  }
  private async mutate(evidence: ConfirmationEvidence, undo: boolean): Promise<void> {
    const id = this.view.proposalId,
      snapshot = this.snapshot
    if (!id || !snapshot || this.writing) return
    const revision = this.revision
    // Lock synchronously before querying focus so simultaneous confirmation events cannot race.
    this.writing = true
    try {
      const current = await this.options.foreground()
      if (!this.current(revision)) return
      if (
        !current ||
        !this.foreground ||
        current.appId !== this.foreground.appId ||
        current.windowTitle !== this.foreground.windowTitle
      ) {
        this.cancel('Destination changed. Create a fresh proposal.')
        return
      }
      const confirmed = this.options.gate.confirm(id, evidence)
      if (!confirmed) return
      this.view.proposalId = null
      this.shown = false
      this.view.phase = undo ? 'restoring' : 'writing'
      this.emit()
      const ok = undo
        ? await this.options.bridge.restoreCell(confirmed)
        : await this.options.bridge.writeFormula(confirmed)
      if (!this.current(revision)) return
      if (!ok) {
        this.view.phase = 'error'
        this.view.canUndo = false
        this.view.explanation =
          'Write outcome unavailable or cell changed. Check Excel before retrying; no automatic retry was sent.'
        this.emit()
        return
      }
      if (undo) {
        this.view.phase = 'idle'
        this.view.canUndo = false
        this.view.explanation = 'Previous cell content restored.'
        this.snapshot = undefined
        this.emit()
        return
      }
      const previous =
        snapshot.before.formula ??
        (snapshot.before.value === null ? '(empty cell)' : String(snapshot.before.value))
      this.view = {
        ...this.view,
        phase: 'written',
        canUndo: true,
        previous,
        reviewPage: 0,
        explanation:
          'Formula written. Review the previous content, then say undo that to restore it. Choose Undo by dwell to open a confirmation card.'
      }
      this.view.proposalId = this.options.gate.propose({
        kind: 'excel-restore',
        content: { snapshot, expectedFormula: this.view.formula }
      })
      this.created = this.options.now()
      this.emit()
    } catch {
      if (this.current(revision)) {
        this.invalidate()
        this.view.phase = 'error'
        this.view.canUndo = false
        this.view.explanation =
          'Write outcome unavailable. Check Excel before retrying; no automatic retry was sent.'
        this.emit()
      }
    } finally {
      this.writing = false
      this.emit()
    }
  }
  async undo(evidence?: ConfirmationEvidence): Promise<void> {
    if (
      this.view.phase !== 'written' ||
      !this.view.canUndo ||
      !this.snapshot ||
      this.options.pause.paused
    )
      return
    if (evidence && this.shown) {
      await this.mutate(evidence, true)
      return
    }
    this.invalidate()
    this.view.phase = 'undo-proposed'
    this.view.reviewPage = 0
    this.view.explanation =
      'Restore the previous content shown here. Say confirm or hold your mouth open for one second after review.'
    this.view.proposalId = this.options.gate.propose({
      kind: 'excel-restore',
      content: { snapshot: this.snapshot, expectedFormula: this.view.formula }
    })
    this.created = this.options.now()
    this.emit()
  }
  tick(): void {
    if (this.view.proposalId && this.options.now() - this.created >= 60000)
      this.cancel('Formula proposal expired. Request it again.')
  }
  settle(): Promise<void> {
    return this.job
  }
  dispose(): void {
    this.cancel()
    this.disposed = true
    this.unsubscribe()
  }
}
