import {
  COMPOSER_CHARACTERS,
  EXCEL_FUNCTIONS,
  PALETTE_KEYS,
  PaletteConfigSchema,
  PaletteControlSchema,
  DraftTextSchema,
  tileAt,
  TranscriptSchema,
  reviewTextPages
} from '@gestura/core'
import type {
  PaletteConfig,
  PaletteState,
  PaletteTile,
  PaletteControl,
  Intent,
  IntentId,
  Transcript,
  FaceFrame,
  ForegroundApp,
  ConfirmationEvidence,
  FormulaAction
} from '@gestura/core'
import { IntentMatcher, normalizeRange } from '@gestura/intent'
import { MouthHold } from '@gestura/gestures'
import type { NativeBridge } from '../native'
import type { PauseController } from '../pause'
import { ActionGate } from '../action-gate'
import { DEFAULT_GESTURE_CONFIG } from '@gestura/core/config'
import type { GestureConfig } from '@gestura/core/config'
import type { ExcelBridge } from '../excel-bridge'
import type { FormulaRouter } from '@gestura/genai'
import { buildFormulaContext, FormulaRequestSchema } from '@gestura/genai'
import type { FormulaRequest, FormulaResponse } from '@gestura/genai'

type Point = { x: number; y: number }
type Composer = NonNullable<PaletteState['composer']>
type Item = { id: string; label: string; disabled?: boolean }
// These IDs are actual controller actions, not descriptive coverage labels.
export const NON_VOICE_PATHS: Record<IntentId, string> = {
  click: 'intent:click',
  'double-click': 'intent:double-click',
  'right-click': 'intent:right-click',
  'drag-on': 'intent:drag-on',
  'drag-off': 'intent:drag-off',
  'scroll-up': 'intent:scroll-up',
  'scroll-down': 'intent:scroll-down',
  pause: 'intent:pause',
  resume: 'pause-corner',
  'open-phrase-palette': 'palette',
  'dictation-on': 'intent:dictation-on',
  'dictation-off': 'intent:dictation-off',
  'undo-that': 'intent:undo-that',
  'go-to': 'compose:range',
  confirm: 'mouth-hold',
  cancel: 'cancel',
  'formula-request': 'compose:formula'
}
const sameTarget = (a: ForegroundApp | undefined, b: ForegroundApp | undefined): boolean =>
  !!a && !!b && a.appId === b.appId && a.windowTitle === b.windowTitle
const externalTarget = (app: ForegroundApp | undefined): app is ForegroundApp =>
  !!app?.appId &&
  !/gestura/i.test(app.appId) &&
  !/^(com\.github\.electron|electron(?:\.exe)?)$/i.test(app.appId) &&
  !/^Gestura (Control|Overlay|Vision|Microphone Capture)$/i.test(app.windowTitle)

export class InputController {
  private readonly gate: ActionGate
  private readonly matcher = new IntentMatcher()
  private readonly mouth: MouthHold
  private settings: PaletteConfig
  private open = false
  private dictating = false
  private formulaListening = false
  private formulaMicWasOn = false
  private composer: Composer | null = null
  private draft = ''
  private page = 0
  private reviewPage = 0
  private pending: PaletteState['pending'] = null
  private target: ForegroundApp | undefined
  private shown = false
  private proposalTime = 0
  private busy = false
  private holdProgress = 0
  private formulaHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  private message = 'Open the palette, or start listening. Text always needs confirmation.'
  private suggestions: { label: string; intent: Intent }[] = []
  private tiles: PaletteTile[] = []
  private pages = 1
  private dwellId: string | null = null
  private dwellSince = 0
  private dwellLatched = false
  private dwellProgress = 0
  private lastPointTime = -Infinity
  private lastDwellTime = -Infinity
  private lastFrame = -Infinity
  private mouthToggleAt = -Infinity
  private consumedMouthToggle = -Infinity
  private speechActivity: 'unknown' | 'silent' | 'speaking' = 'unknown'
  private listening = false
  private revision = 0
  private lastInsertion: { target: ForegroundApp; t: number } | undefined
  private armedClick: 'click' | 'double-click' | 'right-click' | undefined
  private armedDrag = false
  private queue: Promise<void> = Promise.resolve()
  private disposed = false
  private readonly unsubscribe: () => void
  constructor(
    private readonly options: {
      pause: PauseController
      bridge: NativeBridge
      settings: PaletteConfig
      gestures?: GestureConfig
      now(): number
      foreground(): Promise<ForegroundApp | undefined>
      display(): { width: number; height: number }
      publish(state: PaletteState): void
      listening(enabled: boolean): void
      gazeOnly(enabled: boolean): void
      dragging(enabled: boolean): void
      pointerClick(kind: 'click' | 'double-click' | 'right-click'): void
      clipboard(): Promise<string>
      save(settings: PaletteConfig): Promise<void>
      excelBridge?: ExcelBridge
      formulaRouter?: FormulaRouter
      shareSamples?: boolean
    }
  ) {
    this.settings = PaletteConfigSchema.parse(options.settings)
    const gestures = options.gestures ?? DEFAULT_GESTURE_CONFIG
    this.mouth = new MouthHold({ open: gestures.jawOpenScore, close: gestures.jawCloseScore })
    this.gate = new ActionGate(undefined, options.now)
    options.gazeOnly(this.settings.gazeOnly)
    this.unsubscribe = options.pause.subscribe((paused) => {
      if (paused) {
        this.cancel()
        this.lastInsertion = undefined
        this.armedClick = undefined
        this.armedDrag = false
        this.dwellId = null
        this.dwellLatched = true
        this.options.listening(false)
      }
      this.emit()
    })
  }
  get state(): PaletteState {
    this.layout()
    return {
      settings: this.settings,
      open: this.open,
      paused: this.options.pause.paused,
      dictating: this.dictating,
      formulaListening: this.formulaListening,
      busy: this.busy,
      page: this.page,
      pages: this.pages,
      reviewPage: this.reviewPage,
      reviewPages: this.reviewPages.length,
      reviewText: this.reviewPages[this.reviewPage] ?? '',
      composer: this.composer,
      draft: this.draft,
      pending: this.pending,
      holdProgress: this.holdProgress,
      dwellId: this.dwellId,
      dwellProgress: this.dwellProgress,
      message: this.message,
      tiles: this.tiles,
      suggestions: this.suggestions.map((s) => ({ label: s.label, intent: s.intent.id }))
    }
  }
  private emit(): void {
    if (!this.disposed) this.options.publish(this.state)
  }
  private get reviewSource(): string {
    if (!this.pending) return ''
    if (this.pending.kind === 'formula') {
      return `${this.pending.formula} → ${this.pending.targetCell}`
    }
    return this.pending.text
  }
  private get reviewPages(): string[] {
    return reviewTextPages(this.reviewSource, this.options.display().width)
  }
  private enqueue(operation: () => Promise<void> | void): Promise<void> {
    this.queue = this.queue
      .then(async () => {
        if (!this.disposed) await operation()
      })
      .catch((error: unknown) => {
        console.error('[input] action failed:', error)
        this.cancel()
        const detail =
          error instanceof Error && /[Pp]ermission|[Aa]ccessibility/.test(error.message)
            ? 'Accessibility permission is required. Open System Settings → Privacy & Security → Accessibility and enable Gestura.'
            : 'Action unavailable. Check Accessibility permission and the destination, then retry.'
        this.message = detail
      })
      .finally(() => this.emit())
    return this.queue
  }
  settle(): Promise<void> {
    return this.queue
  }
  setSpeechState(live: boolean, activity?: 'unknown' | 'silent' | 'speaking'): void {
    this.listening = live
    if (activity) this.speechActivity = activity
    if (!live && this.formulaListening) {
      this.stopFormulaDictation()
      this.message = 'Formula request stopped because the microphone turned off.'
    }
    this.emit()
  }
  toggleListening(): void {
    if (this.settings.gazeOnly || this.options.pause.paused) return
    if (this.formulaListening) {
      this.stopFormulaDictation()
      this.message = 'Formula request cancelled.'
      return
    }
    this.options.listening(!this.listening)
  }
  private startFormulaDictation(): void {
    if (this.settings.gazeOnly) {
      this.cancel()
      this.composer = 'formula'
      this.open = true
      this.draft = ''
      this.page = 0
      this.message = 'Gaze-only: type the formula request, then choose Use draft.'
      return
    }
    this.cancel()
    this.formulaMicWasOn = this.listening
    this.formulaListening = true
    this.composer = null
    this.open = true
    this.draft = ''
    this.page = 0
    this.message =
      'Formula request listening. Say the formula, then close your mouth and open it to finish.'
    if (!this.listening) this.options.listening(true)
  }
  private stopFormulaDictation(): void {
    const wasMicOn = this.formulaMicWasOn
    this.formulaListening = false
    this.formulaMicWasOn = false
    this.composer = null
    this.open = false
    this.draft = ''
    this.holdProgress = 0
    this.mouth.reset()
    if (!wasMicOn) this.options.listening(false)
  }
  private async finishFormulaDictation(): Promise<void> {
    const utterance = this.draft.trim()
    if (!utterance) {
      this.message =
        'Say the formula request first. Close your mouth, then open and hold to finish.'
      return
    }
    this.stopFormulaDictation()
    await this.handleFormulaRequest(utterance)
  }
  private typeFormulaInstead(): void {
    this.formulaListening = false
    this.formulaMicWasOn = false
    this.composer = 'formula'
    this.open = true
    this.draft = ''
    this.page = 0
    this.options.listening(false)
    this.message = 'Type the formula request, then choose Use draft.'
  }
  gestureToggleListening(t: number): void {
    // P2.4 events share the fresh main-side hold guard; duplicate events in one frame are consumed once.
    if (this.pending || t !== this.mouthToggleAt || t === this.consumedMouthToggle) return
    this.consumedMouthToggle = t
    this.toggleListening()
  }
  private cancel(): void {
    this.revision++
    if (this.pending) this.gate.cancel(this.pending.id)
    this.pending = null
    this.formulaListening = false
    this.formulaMicWasOn = false
    this.target = undefined
    this.shown = false
    this.holdProgress = 0
    this.mouth.reset()
  }
  private async propose(text: string, kind: 'dictation' | 'type-text'): Promise<void> {
    DraftTextSchema.parse(text)
    if (!text || this.options.pause.paused) return
    const previousTarget = this.target
    this.cancel()
    const revision = this.revision
    const target = previousTarget ?? (await this.options.foreground())
    if (revision !== this.revision || this.options.pause.paused) return
    if (!externalTarget(target)) {
      this.message = 'Focus the destination app, then choose the phrase or dictate again.'
      return
    }
    this.target = target
    this.pending = {
      id: this.gate.propose({ kind, content: { text } }),
      text,
      kind,
      target: `${target.appId}: ${target.windowTitle}`
    }
    this.proposalTime = this.options.now()
    this.reviewPage = 0
    this.open = false
    this.composer = null
    this.lastInsertion = undefined
    this.message =
      'Review the text. Say confirm or close your mouth, then hold it open for one second.'
  }
  private async handleFormulaRequest(utterance: string): Promise<void> {
    if (!utterance.trim() || !this.options.excelBridge || !this.options.formulaRouter) {
      this.message = 'Formula generation requires the Excel bridge and a configured GenAI provider.'
      return
    }
    const ctx = await this.options.excelBridge.getContext()
    if (!ctx) {
      this.message =
        'Excel bridge not connected. Open Excel, confirm the add-in is loaded, then try again.'
      return
    }
    const request: FormulaRequest = FormulaRequestSchema.parse({
      utterance,
      lang: 'en',
      context: buildFormulaContext(ctx, this.options.shareSamples ?? false),
      history: this.formulaHistory
    })

    this.message = 'Generating formula...'
    this.emit()

    const result: FormulaResponse = await this.options.formulaRouter.generate(request)

    if (result.status === 'ok') {
      this.formulaHistory.push(
        { role: 'user', content: utterance },
        { role: 'assistant', content: result.formula }
      )
      this.cancel()
      const proposalId = this.gate.propose({
        kind: 'formula',
        content: { formula: result.formula, target: result.targetCell }
      } as FormulaAction)
      this.pending = {
        id: proposalId,
        kind: 'formula',
        formula: result.formula,
        explanation: result.explanation,
        references: result.references,
        targetCell: result.targetCell,
        correctionCount: 0,
        target: 'Excel'
      }
      this.proposalTime = this.options.now()
      this.reviewPage = 0
      this.target = await this.options.foreground()
      this.message = result.explanation
    } else if (result.status === 'needs_clarification') {
      this.message = result.clarificationQuestion
    } else {
      this.message = result.explanation
    }
  }
  control(value: PaletteControl): Promise<void> {
    const command = PaletteControlSchema.parse(value)
    if (command.operation === 'settings') {
      this.settings = command.settings
      this.options.gazeOnly(this.settings.gazeOnly)
      if (this.settings.gazeOnly) this.options.listening(false)
    }
    return this.enqueue(async () => {
      if (command.operation === 'shown') {
        if (
          command.id === this.pending?.id &&
          this.reviewPage === this.reviewPages.length - 1 &&
          !this.shown
        ) {
          this.shown = this.gate.markShown(command.id)
          this.mouth.reset()
        }
      } else if (command.operation === 'settings') {
        await this.persist()
      } else if (command.operation === 'draft') {
        this.draft = command.text
      } else await this.activate(command.id)
    })
  }
  private async persist(): Promise<void> {
    try {
      await this.options.save(this.settings)
    } catch {
      this.message = 'Settings apply now, but could not be saved. Check the app data folder.'
    }
  }
  private items(): Item[] {
    if (this.formulaListening) {
      return [
        { id: 'cancel', label: 'Cancel formula' },
        { id: 'type-formula', label: 'Type formula instead' }
      ]
    }
    if (this.composer) {
      return [
        { id: 'compose:done', label: this.composer === 'phrase' ? 'Save phrase' : 'Use draft' },
        { id: 'compose:backspace', label: 'Erase character' },
        { id: 'compose:clear', label: 'Clear draft' },
        { id: 'compose:close', label: 'Back to palette' },
        ...COMPOSER_CHARACTERS.map((c, i) => ({
          id: `char:${i}`,
          label: c === ' ' ? 'Space' : c === '\n' ? 'New line' : c
        })),
        ...this.settings.phrases.map((p) => ({ id: `append:${p.id}`, label: p.label }))
      ]
    }
    return [
      { id: 'close', label: 'Close palette' },
      { id: 'compose:text', label: 'Compose text' },
      { id: 'compose:phrase', label: 'Add phrase' },
      { id: 'compose:range', label: 'Go to cell / range' },
      { id: 'compose:formula', label: 'Formula request' },
      ...Object.entries(NON_VOICE_PATHS)
        .filter(([, path]) => path.startsWith('intent:'))
        .map(([id, path]) => ({
          id: path,
          label: id[0]!.toUpperCase() + id.slice(1).replaceAll('-', ' ')
        })),
      { id: 'paste', label: 'Paste as proposal' },
      { id: 'copy', label: 'Copy' },
      { id: 'undo', label: 'Undo edit' },
      ...PALETTE_KEYS.map((key) => ({ id: `key:${key}`, label: key.replace('arrow', 'Arrow ') })),
      ...this.settings.phrases.flatMap((p) => [
        { id: `phrase:${p.id}`, label: p.label },
        { id: `edit:${p.id}`, label: `Edit ${p.label}` },
        { id: `remove:${p.id}`, label: `Remove ${p.label}` }
      ]),
      ...EXCEL_FUNCTIONS.map((name) => ({ id: `function:${name}`, label: `=${name}(` })),
      ...this.suggestions.map((s, i) => ({ id: `suggestion:${i}`, label: s.label }))
    ]
  }
  private editingId: string | undefined
  private layout(): void {
    const { width, height } = this.options.display()
    const columns = width < 480 ? 3 : 4
    const w = Math.max(64, Math.floor((Math.min(720, width - 24) - (columns - 1) * 8) / columns))
    const dockWidth = Math.min(w, Math.max(64, Math.floor((width - 120) / 3)))
    const dock = [
      {
        id: 'listen',
        label: this.listening ? 'Stop mic' : 'Listen',
        disabled: this.settings.gazeOnly
      },
      { id: 'palette', label: 'Palette' },
      { id: 'gaze-only', label: this.settings.gazeOnly ? 'Gaze only' : 'Voice + gaze' }
    ]
    this.tiles = dock.map((item, i) => ({
      ...item,
      disabled: !!item.disabled || this.options.pause.paused || this.busy,
      bounds: { x: 12 + i * (dockWidth + 8), y: 12, width: dockWidth, height: 64 }
    }))
    let y = this.pending ? 414 : this.formulaListening ? 250 : 132
    if (this.pending) {
      this.tiles.push(
        ...[
          { id: 'cancel', label: 'Cancel' },
          { id: 'review:previous', label: 'Back text' },
          { id: 'review:next', label: 'Next text' }
        ].map((item, i) => ({
          ...item,
          disabled:
            this.options.pause.paused ||
            this.busy ||
            (i === 1 && this.reviewPage === 0) ||
            (i === 2 && this.reviewPage >= this.reviewPages.length - 1),
          bounds: { x: 12 + i * (w + 8), y: 294, width: w, height: 64 }
        }))
      )
    }
    if (!this.open) return
    if (this.composer) y += 100
    const footer = width < 480 ? 132 : 92
    const rows = Math.max(1, Math.min(4, Math.floor((height - y - footer) / 72)))
    const count = rows * columns
    const items = this.items()
    this.pages = Math.max(1, Math.ceil(items.length / count))
    this.page = Math.min(this.page, this.pages - 1)
    this.tiles.push(
      ...items.slice(this.page * count, (this.page + 1) * count).map((item, i) => ({
        ...item,
        disabled: this.options.pause.paused || this.busy || !!item.disabled,
        bounds: {
          x: 12 + (i % columns) * (w + 8),
          y: y + Math.floor(i / columns) * 72,
          width: w,
          height: 64
        }
      }))
    )
    this.tiles.push(
      ...[
        { id: 'previous', label: 'Previous tiles' },
        { id: 'next', label: `Next tiles (${this.page + 1}/${this.pages})` }
      ].map((item, i) => ({
        ...item,
        disabled:
          this.options.pause.paused ||
          this.busy ||
          (i === 0 ? this.page === 0 : this.page === this.pages - 1),
        bounds: { x: 12 + i * (w + 8), y: y + rows * 72, width: w, height: 64 }
      }))
    )
  }
  reserved(point: Point): boolean {
    if (tileAt(this.tiles, point)) return true
    if (this.open) {
      const bottom = Math.max(...this.tiles.map((tile) => tile.bounds.y + tile.bounds.height))
      if (
        point.x >= 12 &&
        point.x <= Math.min(732, this.options.display().width - 12) &&
        point.y >= 82 &&
        point.y <= bottom
      )
        return true
    }
    return (
      !!this.pending &&
      point.x >= 12 &&
      point.x <= Math.min(732, this.options.display().width - 12) &&
      point.y >= 84 &&
      point.y < 294
    )
  }
  /** Returns true for all overlay regions, even disabled tiles; never fall through to an OS click. */
  click(point: Point): boolean {
    if (this.busy) return true
    const tile = tileAt(this.tiles, point)
    if (!this.reserved(point) && this.armedDrag) {
      this.armedDrag = false
      this.options.dragging(true)
      return true
    }
    if (!this.reserved(point) && this.armedClick) {
      const kind = this.armedClick
      this.armedClick = undefined
      this.options.pointerClick(kind)
      return true
    }
    if (tile && !tile.disabled && !(this.dwellId === tile.id && this.dwellLatched)) {
      this.dwellId = tile.id
      this.dwellLatched = true
      void this.control({ operation: 'activate', id: tile.id })
    }
    return this.reserved(point)
  }
  point(point: Point | null, t: number): void {
    if (this.options.pause.paused || !point || t <= this.lastDwellTime) return
    if (t - this.lastDwellTime > 250) {
      this.dwellId = null
      this.dwellLatched = false
    }
    this.lastDwellTime = t
    const tile = tileAt(this.tiles, point)
    const id = tile && !tile.disabled ? tile.id : null
    if (id !== this.dwellId) {
      this.dwellId = id
      this.dwellSince = t
      this.dwellLatched = false
    }
    this.dwellProgress =
      id && !this.dwellLatched ? Math.min(1, (t - this.dwellSince) / this.settings.dwellMs) : 0
    if (this.dwellProgress === 1 && id) {
      this.dwellLatched = true
      void this.control({ operation: 'activate', id })
    }
  }
  headPoint(point: Point | null): void {
    this.lastPointTime = this.options.now()
    this.point(point, this.lastPointTime)
  }
  tick(systemPoint: Point): void {
    if (this.options.now() - this.lastPointTime > 250) this.point(systemPoint, this.options.now())
    if (this.pending && this.options.now() - this.proposalTime >= 60000) {
      this.cancel()
      this.message = 'Proposal expired. Dictate or choose the text again.'
    }
    if (this.options.now() - this.lastFrame > 250) {
      this.mouth.reset()
      this.holdProgress = 0
    }
    this.emit()
  }
  consume(frame: FaceFrame, live: boolean): void {
    const now = this.options.now()
    if (
      !live ||
      this.busy ||
      this.options.pause.paused ||
      !frame.faceDetected ||
      frame.tCapture <= this.lastFrame ||
      now - frame.tCapture > 250 ||
      frame.tInferDone > now
    ) {
      this.mouth.reset()
      this.holdProgress = 0
      return
    }
    this.lastFrame = frame.tCapture
    const pending = this.pending
    const permitted =
      (!this.listening || this.speechActivity === 'silent') && (!pending || this.shown)
    const hold = this.mouth.update(
      frame.tCapture,
      frame.blendshapes.jawOpen,
      permitted,
      pending || this.formulaListening
        ? 1000
        : (this.options.gestures ?? DEFAULT_GESTURE_CONFIG).jawHoldMs
    )
    this.holdProgress = hold.progress
    if (hold.fired) {
      if (pending) void this.enqueue(() => this.confirm(pending.id, { kind: 'held-mouth-gesture' }))
      else if (this.formulaListening) {
        this.mouthToggleAt = frame.tCapture
        void this.enqueue(() => this.finishFormulaDictation())
      } else {
        this.mouthToggleAt = frame.tCapture
        this.gestureToggleListening(frame.tCapture)
      }
    }
  }
  transcript(value: Transcript): Promise<void> {
    const transcript = TranscriptSchema.parse(value)
    return this.enqueue(async () => {
      if (this.settings.gazeOnly || this.options.pause.paused || !this.listening) return
      if (this.formulaListening) {
        const formulaControl = this.matcher.match(
          transcript.text,
          { pendingProposal: false },
          transcript.tSpeechStart
        )
        const isControl =
          formulaControl.kind === 'match' &&
          formulaControl.method === 'template' &&
          ['cancel', 'pause', 'confirm'].includes(formulaControl.intent.id)
        if (isControl) {
          if (formulaControl.intent.id === 'pause') {
            await this.dispatch(formulaControl.intent)
          } else if (formulaControl.intent.id === 'cancel') {
            this.stopFormulaDictation()
            this.message = 'Formula request cancelled.'
          } else {
            this.message = 'No formula is ready to confirm. Say the formula you want first.'
          }
          return
        }
        const utterance = transcript.text.trim()
        if (!utterance) return
        this.draft = DraftTextSchema.parse(
          (this.draft ? `${this.draft} ${utterance}` : utterance).slice(0, 2000)
        )
        this.message = 'Formula request captured. Close your mouth, then open and hold to finish.'
        return
      }
      let result = this.matcher.match(
        transcript.text,
        { pendingProposal: !!this.pending },
        transcript.tSpeechStart
      )
      if (!this.dictating && result.kind === 'suggestions') {
        const revision = this.revision
        const foreground = await this.options.foreground().catch(() => undefined)
        if (revision !== this.revision || this.options.pause.paused || this.settings.gazeOnly)
          return
        if (foreground && /excel/i.test(foreground.appId))
          result = this.matcher.match(
            transcript.text,
            { app: 'excel', pendingProposal: !!this.pending },
            transcript.tSpeechStart
          )
      }
      // Dictation treats ordinary command-like words as text; only exact mode/confirmation controls interrupt it.
      const control =
        result.kind === 'match' &&
        result.method === 'template' &&
        ['confirm', 'cancel', 'dictation-off', 'undo-that', 'pause'].includes(result.intent.id)
      if (this.dictating && !control) {
        const text =
          (this.pending?.kind === 'dictation' ? this.pending.text + '\n' : '') + transcript.text
        await this.propose(text, 'dictation')
      } else if (result.kind === 'match') {
        if (result.intent.id === 'confirm') {
          if (this.pending && result.evidence) await this.confirm(this.pending.id, result.evidence)
        } else await this.dispatch(result.intent)
      } else if (result.kind === 'genai-request') await this.dispatch(result.intent)
      else {
        this.suggestions = result.suggestions.map((s) => ({ label: s.phrasing, intent: s.intent }))
        this.open = true
        this.composer = null
        this.page = Number.MAX_SAFE_INTEGER
        this.message = 'Command uncertain. Select a suggestion or compose text.'
      }
    })
  }
  private async confirm(id: string, evidence: ConfirmationEvidence): Promise<void> {
    if (!this.pending || this.pending.id !== id) return
    if (this.busy || this.options.pause.paused) return
    if (!this.shown) {
      this.message = 'Review the whole card first, then confirm.'
      return
    }
    const revision = this.revision
    const target = this.target
    const current = await this.options.foreground()
    if (revision !== this.revision || this.options.pause.paused) return
    if (!sameTarget(target, current)) {
      this.cancel()
      this.message =
        'Destination changed. Nothing inserted; create a fresh proposal in the intended app.'
      return
    }
    const confirmed = this.gate.confirm(id, evidence)
    if (!confirmed) {
      this.message = 'Confirmation was not fresh. Review the proposal and try again.'
      return
    }
    const pending = this.pending
    this.cancel()
    this.busy = true
    this.emit()
    try {
      if (pending.kind === 'formula') {
        const wrote = await this.options.excelBridge?.writeFormula(confirmed)
        console.warn(
          `[input] formula write ${wrote ? 'succeeded' : 'failed'} for ${pending.targetCell}`
        )
        this.lastInsertion = wrote && target ? { target, t: this.options.now() } : undefined
        this.message = wrote
          ? 'Formula written to the sheet. Undo that is available for 15 seconds.'
          : 'Could not write the formula. Check that Excel is connected and the target cell is empty.'
      } else {
        const complete = await this.options.bridge.typeText(pending.text, confirmed)
        this.lastInsertion = complete && target ? { target, t: this.options.now() } : undefined
        this.message = complete
          ? 'Text inserted. Undo that is available for this destination for 15 seconds.'
          : 'Insertion stopped. Some text may have been inserted; check the destination.'
      }
    } finally {
      this.busy = false
    }
  }
  invalidateUndo(): void {
    this.lastInsertion = undefined
    this.revision++
    if (this.pending) {
      this.cancel()
      this.message = 'Destination input changed. Create a fresh proposal before inserting text.'
    }
  }
  displayChanged(): void {
    this.cancel()
    this.lastInsertion = undefined
    this.armedClick = undefined
    this.armedDrag = false
    this.open = false
    this.composer = null
    this.message = 'Display changed. Reopen the palette and create a fresh text proposal.'
    this.emit()
  }
  presentationLost(): void {
    if (!this.options.pause.paused) this.options.pause.toggle()
    this.cancel()
    this.message = 'Overlay unavailable. Input paused and text proposal cancelled.'
    this.emit()
  }
  private async undo(): Promise<void> {
    const insertion = this.lastInsertion
    this.lastInsertion = undefined
    const revision = this.revision
    if (
      !insertion ||
      this.options.now() - insertion.t > 15000 ||
      !sameTarget(insertion.target, await this.options.foreground()) ||
      revision !== this.revision ||
      this.options.pause.paused
    ) {
      this.message = 'No recent Gestura insertion can be undone safely in this destination.'
      return
    }
    this.options.bridge.keyCombo(['primary', 'z'])
    this.message = 'Undo sent to the destination app. Check its undo grouping.'
  }
  async dispatch(intent: Intent): Promise<void> {
    if (intent.id === 'pause') {
      if (!this.options.pause.paused) this.options.pause.toggle()
      return
    }
    if (intent.id === 'resume') {
      if (this.options.pause.paused) this.options.pause.toggle()
      return
    }
    if (this.options.pause.paused) return
    switch (intent.id) {
      case 'confirm':
        return // Only trusted speech onset or the mouth state machine can provide evidence.
      case 'cancel':
        if (this.formulaListening) {
          this.stopFormulaDictation()
          this.message = 'Formula request cancelled.'
        } else {
          this.cancel()
          this.message = 'Proposal cancelled.'
        }
        return
      case 'open-phrase-palette':
        this.open = true
        this.composer = null
        this.page = 0
        return
      case 'dictation-on':
        this.dictating = true
        this.message = this.settings.gazeOnly
          ? 'Compose text using the palette. The microphone stays off.'
          : 'Dictation on. Speak to build a proposal, then confirm.'
        if (this.settings.gazeOnly) {
          this.cancel()
          this.open = true
          this.composer = 'text'
          this.draft = ''
          this.page = 0
        }
        return
      case 'dictation-off':
        this.dictating = false
        this.message = 'Dictation off. Pending text still needs confirmation.'
        return
      case 'undo-that':
        await this.undo()
        return
      case 'go-to':
        if (this.options.excelBridge?.selectRange(intent.slots.range ?? '')) {
          this.message = `Selected range ${intent.slots.range}.`
        } else {
          this.message =
            'Excel bridge not connected. Open Excel and confirm the add-in is loaded, then try again.'
        }
        return
      case 'formula-request':
        await this.handleFormulaRequest(intent.slots.request ?? '')
        return
      case 'click':
      case 'double-click':
      case 'right-click':
        this.invalidateUndo()
        if (!this.open) {
          this.options.pointerClick(intent.id)
          return
        }
        this.armedClick = intent.id
        this.open = false
        this.composer = null
        this.message = `Palette hidden. Look at the destination and blink or dwell to ${intent.id}.`
        return
      case 'drag-on':
        this.invalidateUndo()
        this.armedDrag = true
        this.open = false
        this.message =
          'Look at the drag source and blink or dwell to hold the mouse. Choose drag off to release.'
        return
      case 'drag-off':
        this.invalidateUndo()
        this.armedDrag = false
        this.options.dragging(false)
        return
      case 'scroll-up':
      case 'scroll-down':
        this.invalidateUndo()
        this.options.bridge.scroll(0, intent.id === 'scroll-up' ? 3 : -3)
        return
    }
  }
  private async activate(id: string): Promise<void> {
    this.layout()
    // Only presently visible, enabled actions can be selected over IPC.
    if (!this.tiles.some((tile) => tile.id === id && !tile.disabled)) return
    if (id === 'listen') this.toggleListening()
    else if (id === 'compose:formula') this.startFormulaDictation()
    else if (id === 'type-formula') this.typeFormulaInstead()
    else if (id === 'palette') {
      this.open = !this.open
      this.composer = null
      this.page = 0
    } else if (id === 'gaze-only') {
      this.settings = { ...this.settings, gazeOnly: !this.settings.gazeOnly }
      this.options.gazeOnly(this.settings.gazeOnly)
      if (this.settings.gazeOnly) this.options.listening(false)
      await this.persist()
    } else if (id === 'close') {
      this.open = false
      this.composer = null
    } else if (id === 'next' || id === 'previous') this.page += id === 'next' ? 1 : -1
    else if (id === 'cancel') await this.dispatch({ id: 'cancel', slots: {} })
    else if (id.startsWith('review:')) {
      this.reviewPage += id === 'review:next' ? 1 : -1
      this.shown = false
      this.mouth.reset()
    } else if (id.startsWith('char:'))
      this.draft = DraftTextSchema.parse(this.draft + COMPOSER_CHARACTERS[Number(id.slice(5))]!)
    else if (id.startsWith('append:'))
      this.draft = DraftTextSchema.parse(
        this.draft + this.settings.phrases.find((p) => p.id === id.slice(7))!.text
      )
    else if (id === 'compose:clear') this.draft = ''
    else if (id === 'compose:backspace') this.draft = Array.from(this.draft).slice(0, -1).join('')
    else if (id === 'compose:close') {
      this.composer = null
      this.page = 0
    } else if (id === 'compose:done') {
      if (this.composer === 'phrase' && this.draft.trim()) {
        const entry = {
          id: this.editingId ?? `phrase-${this.options.now().toFixed(0)}`,
          label: this.draft.trim().slice(0, 40),
          text: this.draft
        }
        this.settings = PaletteConfigSchema.parse({
          ...this.settings,
          phrases: [...this.settings.phrases.filter((p) => p.id !== entry.id), entry]
        })
        this.editingId = undefined
        await this.persist()
      } else if (this.composer === 'range') {
        const range = normalizeRange(this.draft)
        if (!range) {
          this.message = 'Enter a valid range such as B2 or A1:A10.'
          return
        }
        await this.dispatch({ id: 'go-to', slots: { range } })
      } else if (this.composer === 'formula') {
        if (this.draft.trim())
          await this.dispatch({ id: 'formula-request', slots: { request: this.draft } })
      } else await this.propose(this.draft, 'dictation')
      this.composer = null
      this.page = 0
    } else if (id.startsWith('compose:')) {
      this.cancel()
      this.composer = id.slice(8) as Composer
      this.draft = ''
      this.editingId = undefined
      this.page = 0
    } else if (id.startsWith('phrase:'))
      await this.propose(this.settings.phrases.find((p) => p.id === id.slice(7))!.text, 'type-text')
    else if (id.startsWith('edit:')) {
      this.cancel()
      const phrase = this.settings.phrases.find((p) => p.id === id.slice(5))!
      this.editingId = phrase.id
      this.draft = phrase.text
      this.composer = 'phrase'
      this.page = 0
    } else if (id.startsWith('remove:')) {
      this.settings = {
        ...this.settings,
        phrases: this.settings.phrases.filter((p) => p.id !== id.slice(7))
      }
      await this.persist()
    } else if (id.startsWith('function:')) await this.propose(`=${id.slice(9)}(`, 'type-text')
    else if (id === 'paste') await this.propose(await this.options.clipboard(), 'type-text')
    else if (id.startsWith('key:') || id === 'copy' || id === 'undo') {
      this.invalidateUndo()
      this.options.bridge.keyCombo(
        id === 'copy' ? ['primary', 'c'] : id === 'undo' ? ['primary', 'z'] : [id.slice(4)]
      )
    } else if (id.startsWith('intent:'))
      await this.dispatch({
        id: id.slice(7) as Exclude<IntentId, 'go-to' | 'formula-request'>,
        slots: {}
      })
    else if (id.startsWith('suggestion:')) {
      const suggestion = this.suggestions[Number(id.slice(11))]
      if (suggestion) await this.dispatch(suggestion.intent)
    }
  }
  dispose(): void {
    this.cancel()
    this.disposed = true
    this.unsubscribe()
  }
}
