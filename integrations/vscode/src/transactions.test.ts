import { describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { EditorTransactions } from './transactions'
import type { EditorState } from './transactions'
import type { CodeResponse, CodeSnapshot } from '@gestura/core'
const response: CodeResponse = {
  status: 'ok',
  code: 'NEW',
  insertMode: 'replace_selection',
  explanation: { en: 'Replace selection', zh_hk: '取代選取內容' }
}
function setup(): {
  transactions: EditorTransactions
  apply: ReturnType<typeof vi.fn>
  preview: ReturnType<typeof vi.fn>
  context(): Promise<CodeSnapshot>
  readonly state: EditorState
  change(part: Partial<EditorState>): void
  time(value: number): void
} {
  let now = 1000
  let state: EditorState = {
    uri: 'file:///private/project/a.ts',
    fileName: 'a.ts',
    languageId: 'typescript',
    version: 1,
    text: 'old content',
    start: 0,
    end: 3,
    cursor: 3
  }
  const apply = vi.fn(async (_state: EditorState, start: number, end: number, text: string) => {
    state = {
      ...state,
      text: state.text.slice(0, start) + text + state.text.slice(end),
      version: state.version + 1
    }
    return true
  })
  const preview = vi.fn(async () => true)
  const transactions = new EditorTransactions(
    { current: () => state, preview, apply, clear: vi.fn() },
    () => now
  )
  const context = async (): Promise<CodeSnapshot> => {
    await transactions.handle({ type: 'pause', paused: false })
    const event = await transactions.handle({ type: 'context', id: randomUUID() })
    if (event?.type !== 'context' || !event.snapshot) throw Error('No context')
    return event.snapshot
  }
  return {
    transactions,
    apply,
    preview,
    context,
    get state() {
      return state
    },
    change: (part: Partial<EditorState>) => {
      state = { ...state, ...part }
    },
    time: (value: number) => {
      now = value
    }
  }
}
describe('editor edit transactions', () => {
  it('exports only filename, language, selection and at most 40 centered lines', async () => {
    const s = setup(),
      text = Array.from({ length: 100 }, (_, i) => `line-${i}`).join('\n')
    s.change({
      text,
      start: text.indexOf('line-50'),
      end: text.indexOf('line-50') + 7,
      cursor: text.indexOf('line-50')
    })
    const snapshot = await s.context()
    expect(Object.keys(snapshot.context).sort()).toEqual([
      'fileName',
      'languageId',
      'selection',
      'surroundingLines'
    ])
    expect(snapshot.context.surroundingLines).toHaveLength(40)
    expect(snapshot.context.surroundingLines).toContain('line-50')
    expect(JSON.stringify(snapshot)).not.toContain('/private/project')
  })
  it('previews without mutating and consumes a preview once', async () => {
    const s = setup(),
      snapshot = await s.context(),
      preview = randomUUID()
    expect(
      await s.transactions.handle({
        type: 'preview',
        id: preview,
        snapshot: snapshot.token,
        response
      })
    ).toMatchObject({ ok: true })
    expect(s.apply).not.toHaveBeenCalled()
    const command = { type: 'apply' as const, id: randomUUID(), snapshot: snapshot.token, preview }
    const results = await Promise.all([
      s.transactions.handle(command),
      s.transactions.handle(command)
    ])
    expect(results.filter((r) => r?.type === 'result' && r.ok)).toHaveLength(1)
    expect(s.apply).toHaveBeenCalledOnce()
    expect(s.state.text).toBe('NEW content')
  })
  for (const changed of [
    { version: 2 },
    { start: 1 },
    { uri: 'file:///other.ts' },
    { text: 'changed' }
  ]) {
    it(`rejects changed destination ${JSON.stringify(changed)}`, async () => {
      const s = setup(),
        snapshot = await s.context(),
        preview = randomUUID()
      await s.transactions.handle({
        type: 'preview',
        id: preview,
        snapshot: snapshot.token,
        response
      })
      s.change(changed)
      expect(
        await s.transactions.handle({
          type: 'apply',
          id: randomUUID(),
          snapshot: snapshot.token,
          preview
        })
      ).toMatchObject({ ok: false })
      expect(s.apply).not.toHaveBeenCalled()
    })
  }
  it('requires matching preview and snapshot and rejects expiry, cancel, pause and reconnect', async () => {
    for (const mode of ['expiry', 'cancel', 'pause', 'disconnect', 'wrong-preview']) {
      const s = setup(),
        snapshot = await s.context(),
        preview = randomUUID()
      await s.transactions.handle({
        type: 'preview',
        id: preview,
        snapshot: snapshot.token,
        response
      })
      if (mode === 'expiry') s.time(61000)
      if (mode === 'cancel') await s.transactions.handle({ type: 'cancel' })
      if (mode === 'pause') await s.transactions.handle({ type: 'pause', paused: true })
      if (mode === 'disconnect') s.transactions.disconnect()
      await s.transactions.handle({
        type: 'apply',
        id: randomUUID(),
        snapshot: snapshot.token,
        preview: mode === 'wrong-preview' ? randomUUID() : preview
      })
      expect(s.apply, mode).not.toHaveBeenCalled()
    }
  })
  it('inserts at the cursor without replacing selection and restores exact prior text via a new preview', async () => {
    const s = setup(),
      snapshot = await s.context(),
      preview = randomUUID()
    await s.transactions.handle({
      type: 'preview',
      id: preview,
      snapshot: snapshot.token,
      response: { ...response, insertMode: 'insert_at_cursor' }
    })
    await s.transactions.handle({
      type: 'apply',
      id: randomUUID(),
      snapshot: snapshot.token,
      preview
    })
    expect(s.state.text).toBe('oldNEW content')
    const undo = randomUUID()
    await s.transactions.handle({ type: 'undoPreview', id: undo, snapshot: snapshot.token })
    await s.transactions.handle({
      type: 'undo',
      id: randomUUID(),
      snapshot: snapshot.token,
      preview: undo
    })
    expect(s.state.text).toBe('old content')
    expect(s.apply).toHaveBeenCalledTimes(2)
  })
  it('does not undo over intervening edits', async () => {
    const s = setup(),
      snapshot = await s.context(),
      preview = randomUUID()
    await s.transactions.handle({
      type: 'preview',
      id: preview,
      snapshot: snapshot.token,
      response
    })
    await s.transactions.handle({
      type: 'apply',
      id: randomUUID(),
      snapshot: snapshot.token,
      preview
    })
    s.change({ text: 'manual edit', version: 3 })
    expect(
      await s.transactions.handle({
        type: 'undoPreview',
        id: randomUUID(),
        snapshot: snapshot.token
      })
    ).toMatchObject({ ok: false })
    expect(s.apply).toHaveBeenCalledOnce()
  })
  it('rejects oversized context instead of silently sharing more', async () => {
    const s = setup()
    s.change({ text: 'x'.repeat(17000), start: 0, end: 17000 })
    await s.transactions.handle({ type: 'pause', paused: false })
    expect(await s.transactions.handle({ type: 'context', id: randomUUID() })).toMatchObject({
      snapshot: null
    })
  })
})
