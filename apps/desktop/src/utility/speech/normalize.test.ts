import { expect, it } from 'vitest'
import { traditionalHongKong } from './normalize'
it('converts Simplified Chinese to Hong Kong variants without translating Cantonese or symbols', () => {
  expect(traditionalHongKong('广东话里面的这个文件')).toBe('廣東話裏面的這個文件')
  const text = '我哋喺呢度食咗飯 =SUM(A1:A3) $25 (你好)'
  expect(traditionalHongKong(text)).toBe(text)
  expect(traditionalHongKong('Hello =SUM(A1:A3)')).toBe('Hello =SUM(A1:A3)')
})
