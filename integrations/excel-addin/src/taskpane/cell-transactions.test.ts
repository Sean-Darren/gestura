import { describe, expect, it, vi } from 'vitest'
import type { ExcelSnapshot } from '@gestura/core'
import { CellTransactions } from './cell-transactions'
function fixture(before: ExcelSnapshot['before'] = { formula: null, value: '=literal text' }): {
  tx: CellTransactions
  replace: ReturnType<typeof vi.fn>
  edit(v: ExcelSnapshot['before']): void
  read(): ExcelSnapshot['before']
  advance(n: number): void
} {
  let value = structuredClone(before),
    time = 0
  const replace = vi.fn(
    async (
      _sheet: string,
      _target: string,
      expected: ExcelSnapshot['before'],
      next: ExcelSnapshot['before']
    ) => {
      if (JSON.stringify(value) !== JSON.stringify(expected)) throw Error('Cell changed')
      value = structuredClone(next)
    }
  )
  return {
    tx: new CellTransactions(
      { read: async () => structuredClone(value), replace },
      'b2c2d3e4-1234-4234-8234-123456789abc',
      () => time
    ),
    replace,
    edit: (v) => {
      value = v
    },
    read: () => value,
    advance: (n) => {
      time += n
    }
  }
}
describe('connection-local Excel snapshots', () => {
  it.each([
    { formula: null, value: '=literal text' },
    { formula: '=1+2', value: null },
    { formula: null, value: 42 },
    { formula: null, value: false },
    { formula: null, value: null }
  ])('restores original cell content %j', async (before) => {
    const f = fixture(before)
    const s = await f.tx.prepare('sheet-1', 'C2')
    await f.tx.commit(s, '=SUM(A1:A3)')
    await f.tx.restore(s, '=SUM(A1:A3)')
    expect(f.read()).toEqual(before)
    await expect(f.tx.restore(s, '=SUM(A1:A3)')).rejects.toThrow('No matching')
    expect(f.replace).toHaveBeenCalledTimes(2)
  })
  it('reserves a snapshot before awaiting to prevent duplicate writes', async () => {
    const f = fixture()
    const s = await f.tx.prepare('sheet-1', 'C2')
    const results = await Promise.allSettled([f.tx.commit(s, '=1'), f.tx.commit(s, '=1')])
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected'])
    expect(f.replace).toHaveBeenCalledOnce()
  })
  it('rejects tampering, reconnects and stale snapshots', async () => {
    const f = fixture()
    const s = await f.tx.prepare('sheet-1', 'C2')
    await expect(f.tx.commit({ ...s, target: 'D2' }, '=1')).rejects.toThrow()
    await expect(f.tx.commit({ ...s, sessionId: crypto.randomUUID() }, '=1')).rejects.toThrow()
    f.advance(60000)
    await expect(f.tx.commit(s, '=1')).rejects.toThrow()
    f.tx.clear()
    await expect(f.tx.restore(s, '=1')).rejects.toThrow()
    expect(f.replace).not.toHaveBeenCalled()
  })
  it('detects mutation of the returned snapshot object', async () => {
    const f = fixture(),
      s = await f.tx.prepare('sheet-1', 'C2')
    s.before.value = 'tampered'
    await expect(f.tx.commit(s, '=1')).rejects.toThrow()
    expect(f.replace).not.toHaveBeenCalled()
  })
  it('refuses to overwrite edits made after proposal or after insertion', async () => {
    const f = fixture()
    const first = await f.tx.prepare('sheet-1', 'C2')
    f.edit({ formula: null, value: 'manual edit' })
    await expect(f.tx.commit(first, '=1')).rejects.toThrow('Cell changed')
    const second = await f.tx.prepare('sheet-1', 'C2')
    await f.tx.commit(second, '=2')
    f.edit({ formula: '=3', value: null })
    await expect(f.tx.restore(second, '=2')).rejects.toThrow('Cell changed')
    expect(f.read()).toEqual({ formula: '=3', value: null })
  })
})
