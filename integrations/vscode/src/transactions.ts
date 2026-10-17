import { randomUUID } from 'node:crypto'
import { CodeCommandSchema, CodeContextSchema } from '@gestura/core'
import type { CodeCommand, CodeEvent, CodeResponse } from '@gestura/core'
export type EditorState = {
  uri: string
  version: number
  fileName: string
  languageId: string
  text: string
  start: number
  end: number
  cursor: number
}
export interface EditorAdapter {
  current(): EditorState | undefined
  preview(before: string, after: string, languageId: string, id: string): Promise<boolean>
  clear(): void
  apply(state: EditorState, start: number, end: number, text: string): Promise<boolean>
}
type Snapshot = { token: string; state: EditorState; created: number }
type Preview = {
  id: string
  snapshot: Snapshot
  code: string
  start: number
  end: number
  undo: boolean
  after: string
}
export class EditorTransactions {
  private snapshot: Snapshot | undefined
  private preview: Preview | undefined
  private receipt: { snapshot: Snapshot; after: EditorState } | undefined
  private paused = true
  private revision = 0
  private writing = false
  constructor(
    private readonly editor: EditorAdapter,
    private readonly now = Date.now
  ) {}
  disconnect(): void {
    this.paused = true
    this.revision++
    this.preview = undefined
    this.snapshot = undefined
    this.receipt = undefined
    this.editor.clear()
  }
  private same(a: EditorState, b: EditorState | undefined): boolean {
    return (
      !!b &&
      a.uri === b.uri &&
      a.version === b.version &&
      a.text === b.text &&
      a.start === b.start &&
      a.end === b.end &&
      a.cursor === b.cursor
    )
  }
  private fresh(snapshot: Snapshot): boolean {
    const age = this.now() - snapshot.created
    return age >= 0 && age < 60000
  }
  async handle(value: CodeCommand): Promise<CodeEvent | undefined> {
    const command = CodeCommandSchema.parse(value)
    if (command.type === 'pause') {
      this.paused = command.paused
      if (command.paused) {
        this.revision++
        this.preview = undefined
        this.receipt = undefined
        this.snapshot = undefined
        this.editor.clear()
      }
      return
    }
    if (command.type === 'cancel') {
      this.revision++
      this.preview = undefined
      this.editor.clear()
      return
    }
    const failure: CodeEvent =
      command.type === 'context'
        ? { type: 'context', id: command.id, snapshot: null }
        : { type: 'result', id: command.id, ok: false }
    if (this.paused || this.writing) return failure
    const revision = this.revision
    if (command.type === 'context') {
      const state = this.editor.current()
      if (!state || state.text.length > 1_000_000) return failure
      const lines = state.text.split(/\r?\n/),
        row = state.text.slice(0, state.cursor).split(/\r?\n/).length - 1
      const from = Math.max(0, Math.min(row - 20, lines.length - 40))
      const parsed = CodeContextSchema.safeParse({
        languageId: state.languageId,
        fileName: state.fileName,
        selection: state.text.slice(state.start, state.end),
        surroundingLines: lines.slice(from, from + 40)
      })
      if (!parsed.success) return failure
      this.snapshot = { token: randomUUID(), state, created: this.now() }
      this.receipt = undefined
      this.preview = undefined
      return {
        type: 'context',
        id: command.id,
        snapshot: { token: this.snapshot.token, context: parsed.data }
      }
    }
    if (command.type === 'preview' || command.type === 'undoPreview') {
      const undo = command.type === 'undoPreview'
      const snapshot = undo ? this.receipt?.snapshot : this.snapshot
      const expected = undo ? this.receipt?.after : snapshot?.state
      if (
        !snapshot ||
        command.snapshot !== snapshot.token ||
        !this.fresh(snapshot) ||
        !expected ||
        !this.same(expected, this.editor.current())
      )
        return failure
      let start = snapshot.state.start,
        end = snapshot.state.end
      let code: string
      if (undo) {
        const receipt = this.receipt!
        const old = snapshot.state
        // Full-document restore stays local and requires an exact document/version match.
        start = 0
        end = receipt.after.text.length
        code = old.text
      } else {
        const response: CodeResponse = command.response
        if (response.status !== 'ok') return failure
        if (response.insertMode === 'insert_at_cursor') start = end = snapshot.state.cursor
        code = response.code
      }
      const after = expected.text.slice(0, start) + code + expected.text.slice(end)
      if (after.length > 1_000_000) return failure
      this.preview = undefined
      if (
        !(await this.editor.preview(expected.text, after, expected.languageId, command.id)) ||
        revision !== this.revision ||
        this.paused ||
        !this.same(expected, this.editor.current())
      )
        return failure
      this.preview = { id: command.id, snapshot, code, start, end, undo, after }
      return { type: 'result', id: command.id, ok: true }
    }
    const preview = this.preview
    if (
      !preview ||
      command.snapshot !== preview.snapshot.token ||
      command.preview !== preview.id ||
      (command.type === 'undo') !== preview.undo ||
      !this.fresh(preview.snapshot)
    )
      return failure
    const expected = preview.undo ? this.receipt?.after : preview.snapshot.state
    if (!expected || !this.same(expected, this.editor.current())) return failure
    this.preview = undefined // Consume before awaiting WorkspaceEdit; duplicate commands cannot write twice.
    this.writing = true
    try {
      const ok = await this.editor.apply(expected, preview.start, preview.end, preview.code)
      const after = this.editor.current()
      if (
        !ok ||
        !after ||
        after.uri !== expected.uri ||
        after.text !== preview.after ||
        this.paused ||
        revision !== this.revision
      ) {
        this.receipt = undefined
        return failure
      }
      this.receipt = preview.undo ? undefined : { snapshot: preview.snapshot, after }
      this.editor.clear()
      return { type: 'result', id: command.id, ok: true }
    } finally {
      this.writing = false
    }
  }
}
