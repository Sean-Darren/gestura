import { Converter } from 'opencc-js'
const toHk = Converter({ from: 'cn', to: 'hk' })

export function traditionalHongKong(text: string): string {
  // No paraphrasing or dialect translation: OpenCC only changes script/variants.
  const converted = toHk(text)
  return converted === text ? text : converted
}
