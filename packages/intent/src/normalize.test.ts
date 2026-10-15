import { expect, it } from 'vitest'
import { normalizeRange, normalizeUtterance } from './normalize'
it('folds width/case/punctuation and Traditional/Simplified forms consistently', () => {
  expect(normalizeUtterance(' ＤＯＵＢＬＥ－ＣＬＩＣＫ！ ')).toBe('double click')
  expect(normalizeUtterance('暫停輸入')).toBe(normalizeUtterance('暂停输入'))
  expect(normalizeUtterance('幫我 click！')).toBe(normalizeUtterance('帮我click'))
})
it.each([
  ['Ｂ 二', 'B2'],
  ['bee two', 'B2'],
  ['A one to A ten', 'A1:A10'],
  ['A1 到 A10', 'A1:A10'],
  ['alpha one hundred and two', 'A102'],
  ['A 一百零二', 'A102'],
  ['A 一零', 'A10'],
  ['a a twenty one', 'AA21'],
  ['double u seven', 'W7'],
  ['oh two', 'O2'],
  ['A1-A10', 'A1:A10'],
  ['XFD1048576', 'XFD1048576'],
  ['BEE2', 'BEE2'],
  ['TEE2', 'TEE2'],
  ['EN2', 'EN2'],
  ['A廿一', 'A21'],
  ['A卅', 'A30'],
  ['A卌二', 'A42']
])('normalizes spoken cell/range %s', (input, expected) =>
  expect(normalizeRange(input)).toBe(expected)
)
it.each(['A0', 'A01', 'XFE1', 'AAAA1', 'A1048577', 'A1:A2:A3', 'A1;DROP', 'B2 extra'])(
  'rejects invalid cell/range %s',
  (input) => {
    expect(normalizeRange(input)).toBeUndefined()
  }
)
